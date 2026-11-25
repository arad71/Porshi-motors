// Admin menu: groups follow the plan (Sales, Service, Stock → CRM).
export const GROUPS = [
  ['gOver', ['dash', 'reports', 'catalog']],
  ['gSales', ['leads', 'sales', 'orders', 'payments']],
  ['gSvc', ['service', 'mechanics', 'issued', 'warranty']],
  ['gStock', ['stock', 'batteries', 'parts']],
  ['gCrm', ['customers', 'remind']],
  ['gSys', ['staff', 'settings', 'audit']],
];
export const LABEL = {
  dash: 'aDash', reports: 'aRep', catalog: 'aCat', leads: 'aLeads', sales: 'aSales', orders: 'aOrd', payments: 'aPay',
  service: 'aJob', mechanics: 'aMech', issued: 'aIss', warranty: 'aWar', stock: 'aBikes', batteries: 'aBat',
  parts: 'aParts', customers: 'aCus', remind: 'aRem', staff: 'aStaff', settings: 'aSet', audit: 'aAud',
};
