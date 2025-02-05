import { get, keyBy } from 'lodash';
import { ILoadbalance, IServiceNode, IServer, ILoadbalancer, IConsulService } from '@nestcloud/common';

import { IRuleOptions } from './interfaces/rule-options.interface';
import { Loadbalancer } from './loadbalancer';
import { Server } from './server';
import { PASSING, ServerState } from './server-state';
import { IRule } from './interfaces/rule.interface';
import { ServiceNotExistException } from './exceptions/service-not-exist.exception';

const axios = require('axios');

export class Loadbalance implements ILoadbalance {
    private readonly service: IConsulService;
    private readonly loadbalancers: { [service: string]: Loadbalancer } = {};
    private rules: IRuleOptions[];
    private globalRuleCls: IRule | Function;
    private readonly customRulePath: string;
    private timer = null;

    constructor(service: IConsulService, customRulePath: string) {
        this.service = service;
        this.customRulePath = customRulePath;
    }

    public async init(rules: IRuleOptions[], globalRuleCls) {
        this.rules = rules;
        this.globalRuleCls = globalRuleCls;

        const services: string[] = this.service.getServiceNames();
        await this.updateServices(services);
        this.service.watchServiceList((services: string[]) => this.updateServices(services));

        if (this.timer) {
            clearInterval(this.timer);
        }
        this.timer = setInterval(() => this.pingServers(), 30000);
    }

    public chooseLoadbalancer(serviceName: string): ILoadbalancer {
        const loadbalancer = this.loadbalancers[serviceName];
        if (!loadbalancer) {
            throw new Error(`The service ${ serviceName } is not exist`);
        }
        return loadbalancer;
    }

    public choose(serviceName: string): IServer {
        const loadbalancer = this.loadbalancers[serviceName];
        if (!loadbalancer) {
            throw new ServiceNotExistException(`The service ${ serviceName } is not exist`);
        }
        return loadbalancer.chooseService();
    }

    public state(): { [service: string]: IServer[] } {
        const state = {};
        for (const service in this.loadbalancers) {
            state[service] = this.loadbalancers[service].servers;
        }
        return state;
    }

    private updateServices(services: string[]) {
        const ruleMap = keyBy(this.rules, 'service');
        services.forEach(service => {
            const nodes = this.service.getServiceNodes(service);
            if (!service || this.loadbalancers[service]) {
                return null;
            }

            const ruleCls = get(ruleMap[service], 'ruleCls', this.globalRuleCls);
            this.createLoadbalancer(service, nodes, ruleCls);
            this.createServiceWatcher(service, ruleCls);
        });
    }

    private createServiceWatcher(service: string, ruleCls: IRule | Function) {
        this.service.watch(service, (nodes: IServiceNode[]) => this.createLoadbalancer(service, nodes, ruleCls));
    }

    private createLoadbalancer(serviceName, nodes, ruleCls) {
        const loadbalancer: Loadbalancer = this.loadbalancers[serviceName];
        const servers = nodes.map(node => {
            const server = new Server(node.address, node.port);
            server.name = node.name;
            if (loadbalancer && loadbalancer.getServer(server.id)) {
                server.state = loadbalancer.getServer(server.id).state;
            } else {
                server.state = new ServerState();
            }
            server.state.status = node.status;
            return server;
        });

        this.loadbalancers[serviceName] = new Loadbalancer({
            id: serviceName,
            servers,
            ruleCls,
            customRulePath: this.customRulePath,
        });
    }

    private pingServers() {
        for (const service in this.loadbalancers) {
            if (!this.loadbalancers.hasOwnProperty(service)) {
                continue;
            }
            const loadbalancer = this.loadbalancers[service];
            const servers = loadbalancer.servers;
            const rule: IRuleOptions = this.rules.filter(rule => rule.service === service)[0] || {
                service: '',
                ruleCls: '',
                check: {
                    protocol: 'http',
                    url: '/health'
                }
            };

            servers.filter(server => server.state.status !== PASSING).map(async server => {
                try {
                    await axios.get(
                        `${ get(rule, 'check.protocol', 'http') }://${ server.address }:${ server.port }${ get(rule, 'check.url', '/health') }`
                    );
                    server.state.status = PASSING;
                } catch (e) {

                }
            })
        }
    }
}
