import { IClientConfig } from "./interfaces/grpc-configuration.interface";
import { ClientGrpcProxy } from '@nestjs/microservices/client';
import { NestCloud } from "@nestcloud/core";
import { ILoadbalance, IServer } from "@nestcloud/common";
import { GrpcDelegate } from "@nestcloud/loadbalance";

export class GrpcClient {
    private readonly config: IClientConfig;
    private readonly proxy: ClientGrpcProxy;
    private readonly proxyCache = new Map<string, ClientGrpcProxy>();
    private readonly serviceCache = new Map<string, any>();

    constructor(config: IClientConfig) {
        this.config = config;
        this.proxy = new ClientGrpcProxy(config);
    }

    public getService<T extends {}>(name: string): T {
        const noClusterService = this.proxy.getService<T>(name);

        const grpcService = {} as T;
        const protoMethods = Object.keys(noClusterService);
        protoMethods.forEach(key => {
            grpcService[key] = (...args: any[]) => {
                let { service, node } = this.getProxyService<T>(name, key);
                if (!service) {
                    service = noClusterService;
                    return service[key](...args);
                }

                return new GrpcDelegate(node, service).execute(key, ...args);
            };
        });
        return grpcService;
    }

    private scheduleCleanCache() {

    }

    private getProxyService<T extends {}>(name: string, method: string): { service: T, node: IServer } {
        const lb: ILoadbalance = NestCloud.global.loadbalance;
        if (!lb) {
            return { service: null, node: null };
        }
        const node = lb.choose(this.config.service);
        const methodKey = `${ node.id }/${ method }`;
        if (!this.serviceCache.get(methodKey)) {
            if (!this.proxyCache.has(node.id)) {
                const proxy = new ClientGrpcProxy({
                    url: `${ node.address }:${ node.port }`,
                    package: this.config.package,
                    protoPath: this.config.protoPath,
                });
                this.proxyCache.set(node.id, proxy);
            }
            const proxy = this.proxyCache.get(node.id);
            const service = proxy.getService<T>(name);
            this.serviceCache.set(methodKey, service);
        }

        const service = this.serviceCache.get(methodKey) as T;

        return { service, node };
    }
}
