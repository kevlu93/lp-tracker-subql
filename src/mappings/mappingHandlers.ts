import { SubstrateEvent } from "@subql/types";
import { Codec } from "@polkadot/types/types";
import { Account, Pool, PoolSummary} from "../types/models";

function getToken(currencyId: Codec): string {
  const currencyJson = JSON.parse(currencyId.toString());

  if (currencyJson.token) return currencyJson.token;
  if (currencyJson.dexShare) {
    const [tokenA, tokenB] = currencyJson.dexShare;
    return `${tokenA.token}<>${tokenB.token} LP`;
  }

  return "??";
}

function createAccount(id: string) {
  const entity = new Account(id);
  return entity;
}
function createPool(poolType: string, accountId: string) {
  const poolId = accountId + "|" + poolType;
  const entity = new Pool(poolId);
  entity.accountId = accountId;
  entity.type = poolType
  entity.token0Amount = BigInt(0);
  entity.token1Amount = BigInt(0);
  entity.shareTokenAmount = BigInt(0);
  return entity;
}

function createPoolSummary(poolType: string) {
  const entity = new PoolSummary(poolType);
  entity.type = poolType;
  entity.token0Total =  BigInt(0);
  entity.token1Total = BigInt(0);
  entity.shareTokenTotal = BigInt(0);
  return entity;
}

export async function handleLiquidityPoolEvent(event: SubstrateEvent): Promise<void> {
  //ignore event if it is not adding or removing liquidity to a pool
  if (event.event.section != "dex" || 
      (event.event.method != "AddLiquidity" && 
      event.event.method != "RemoveLiquidity")) {
    return;
  }
  const {
    event: {
      data: [accountId, pool0currency, pool0Amt, pool1currency, pool1Amt, shareTokenAmt],
    },
  } = event;
  const eventType = event.event.method;

  //create the account if necessary
  let accountEntity = await Account.get(accountId.toString());
  if (accountEntity == undefined) {
    accountEntity = createAccount(accountId.toString());
    await accountEntity.save();
  }
  //create the pool if necessary
  const poolType = getToken(pool0currency) + "|" + getToken(pool1currency);
  let poolEntity = await Pool.get(poolType + "|" + accountId.toString());
  if (poolEntity == undefined) {
    poolEntity = createPool(poolType, accountId.toString());
    await poolEntity.save();
  }
  //create the pool summary if necessary
  let poolSummaryEntity = await PoolSummary.get(poolType);
  if (poolSummaryEntity == undefined) {
    poolSummaryEntity = createPoolSummary(poolType);
    await poolSummaryEntity.save();
  }

  //if event was removing liquidity, set amounts to negative
  let pool0Amount = BigInt(pool0Amt.toString()); 
  let pool1Amount = BigInt(pool1Amt.toString());
  let shareTokenAmount = BigInt(shareTokenAmt.toString());
  if (event.event.method == "RemoveLiquidity") {
    pool0Amount = pool0Amount * BigInt(-1);
    pool1Amount = pool1Amount * BigInt(-1);
    shareTokenAmount = shareTokenAmount * BigInt(-1);
  }

  //update the account pool
  poolEntity.token0Amount += BigInt(pool0Amount.toString());
  poolEntity.token1Amount += BigInt(pool1Amount.toString());
  poolEntity.shareTokenAmount += BigInt(shareTokenAmount.toString());
  await poolEntity.save();

  //update the total pool summary
  poolSummaryEntity.token0Total += BigInt(pool0Amount.toString());
  poolSummaryEntity.token1Total += BigInt(pool1Amount.toString());
  poolSummaryEntity.shareTokenTotal += BigInt(shareTokenAmount.toString());
  await poolSummaryEntity.save();

  await accountEntity.save();
    
}
