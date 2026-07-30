// ===== Excel Parser Module (facade — re-exports from decomposed parsers) =====

export type { ImportData } from './excel-sheet-parser';
export { parseExcelFile } from './excel-sheet-parser';
export { parseLevelsData, parsePurchaseEventsData, parseAccountsData } from './excel-simple-parser';
export { isAccountsDetailFormat, parseAccountsDetailVerticalLayout } from './excel-accounts-detail-parser';
export { isVerticalGameDetailFormat, isHorizontalGameDetailFormat, parseVerticalLayoutData, parseHorizontalLayoutData } from './excel-game-detail-parser';
