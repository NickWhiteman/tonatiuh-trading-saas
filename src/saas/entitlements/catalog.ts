export type PlanId='FREE'|'PRO';
export type Entitlements={maxExchangeConnections:number;maxBots:number;maxMembers:number;monthlyBotCommands:number;liveTrading:boolean};
export const planCatalog:Record<PlanId,Entitlements>={
  FREE:{maxExchangeConnections:1,maxBots:1,maxMembers:1,monthlyBotCommands:0,liveTrading:false},
  PRO:{maxExchangeConnections:5,maxBots:10,maxMembers:10,monthlyBotCommands:10_000,liveTrading:true},
};
