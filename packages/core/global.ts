import { NestContainer } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import {
    IBoot,
    IConfig,
    IConsulService,
    ILoadbalance,
    IProxy,
    IMemcached,
    IComponent,
    NEST_BOOT,
    NEST_CONSUL,
    NEST_CONFIG,
    NEST_LOADBALANCE,
    NEST_CONSUL_SERVICE,
    NEST_PROXY,
} from '@nestcloud/common';
import * as Consul from 'consul';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import Axios from 'axios';

export class Global {
    private readonly callbackMap = new Map<string, ((IComponent) => void)[]>();
    /**
     * Nest Application
     */
    private _app: INestApplication;

    /**
     * NestCloud Components
     */
    private _boot: IBoot;
    private _consul: Consul;
    private _config: IConfig;
    private _consulService: IConsulService;
    private _loadbalance: ILoadbalance;
    private _proxy: IProxy;
    private _memcached: IMemcached;

    /**
     * Global Http Client
     */
    private _axios: AxiosInstance;

    public get app(): INestApplication {
        return this._app;
    }

    public set app(app: INestApplication) {
        this._app = app;
    }

    public get boot(): IBoot {
        return this._boot;
    }

    public set boot(boot: IBoot) {
        this._boot = boot;
        this.trigger(NEST_BOOT, boot);
    }

    public get consul(): Consul {
        return this._consul;
    }

    public set consul(consul: Consul) {
        this._consul = consul;
        this.trigger(NEST_CONSUL, consul);
    }

    public get consulConfig(): IConfig {
        return this._config;
    }

    public set consulConfig(config: IConfig) {
        this._config = config;
        this.trigger(NEST_CONFIG, config);
    }

    public get consulService(): IConsulService {
        return this._consulService;
    }

    public set consulService(consulService: IConsulService) {
        this._consulService = consulService;
        this.trigger(NEST_CONSUL_SERVICE, consulService);
    }

    public get loadbalance(): ILoadbalance {
        return this._loadbalance;
    }

    public set loadbalance(loadbalance: ILoadbalance) {
        this._loadbalance = loadbalance;
        this.trigger(NEST_LOADBALANCE, loadbalance);
    }

    public get proxy(): IProxy {
        return this._proxy;
    }

    public set proxy(proxy: IProxy) {
        this._proxy = proxy;
        this.trigger(NEST_PROXY, proxy);
    }

    public get memcached(): IMemcached {
        return this._memcached;
    }

    public set memcached(memcached: IMemcached) {
        this._memcached = memcached;
    }

    public get axios(): AxiosInstance {
        return this._axios;
    }

    public set axiosConfig(axiosConfig: AxiosRequestConfig) {
        this._axios = Axios.create(axiosConfig);
    }

    public watch<T extends IComponent>(component: string, callback: (component: T) => void) {
        if (this.callbackMap.has(component)) {
            const callbacks = this.callbackMap.get(component);
            callbacks.push(callback);
            this.callbackMap.set(component, callbacks);
        } else {
            this.callbackMap.set(component, [callback]);
        }
    }

    public getContainer(): NestContainer {
        return this._app ? (this._app as any).container : void 0;
    }

    private trigger(component: string, value: IComponent) {
        if (this.callbackMap.has(component)) {
            const callbacks = this.callbackMap.get(component);
            callbacks.forEach(cb => cb(value));
        }
    }
}
