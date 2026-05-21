import type {
  BuildingType,
  CityInventory,
  NeedFulfillment,
  ReligionState,
  SocietySnapshot,
} from '../../types';

const FOOD_PER_CAPITA = 0.08;
const GOODS_PER_CAPITA = 0.04;

function countBuildings(buildings: Iterable<BuildingType>, ...types: BuildingType[]): number {
  const set = new Set(types);
  let n = 0;
  for (const t of buildings) {
    if (set.has(t)) n += 1;
  }
  return n;
}

export function computeNeedFulfillment(
  society: SocietySnapshot,
  buildings: Iterable<BuildingType>,
  inventory: CityInventory,
): NeedFulfillment {
  const pop = Math.max(1, society.population);
  const houses = countBuildings(buildings, 'house');
  const farms = countBuildings(buildings, 'farm_wheat');
  const forums = countBuildings(buildings, 'forum');
  const markets = countBuildings(buildings, 'market', 'trade_post', 'dock');
  const temples = countBuildings(buildings, 'shrine', 'temple', 'oracle');
  const weapons = inventory.weapons ?? 0;

  const foodStock = (inventory.wheat ?? 0) + (inventory.wine ?? 0) * 0.5;
  const foodFromBuildings = farms * 12;
  const food = Math.min(100, Math.round(((foodStock / pop) / FOOD_PER_CAPITA + foodFromBuildings / pop) * 40));

  const shelterCap = houses * 8;
  const shelter =
    society.population <= 0
      ? 100
      : Math.min(100, Math.round((shelterCap / society.population) * 100));

  const safetyBase = forums * 8 + Math.min(30, weapons / Math.max(1, pop / 10));
  const safety = Math.min(100, Math.round(35 + safetyBase - society.social.crime.rate * 0.35));

  const goodsStock =
    (inventory.pottery ?? 0) + (inventory.olive_oil ?? 0) + (inventory.wine ?? 0) * 0.5;
  const goodsFromTrade = markets * 10;
  const goods = Math.min(
    100,
    Math.round(((goodsStock / pop) / GOODS_PER_CAPITA + goodsFromTrade / pop) * 35),
  );

  const culture = cultureFromReligion(society.religion, temples);

  return { food, shelter, safety, goods, culture };
}

function cultureFromReligion(religion: ReligionState, templeCount: number): number {
  const favor =
    (religion.favor.jupiter + religion.favor.mars + religion.favor.ceres) / 3;
  return Math.min(100, Math.round(religion.coveragePercent * 0.55 + favor * 0.25 + templeCount * 4));
}

export function averageNeedFulfillment(needs: NeedFulfillment): number {
  return Math.round(
    (needs.food + needs.shelter + needs.safety + needs.goods + needs.culture) / 5,
  );
}
