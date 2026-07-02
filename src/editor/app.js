import {
  LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE_ENUM,
  resolveInitialLanguageEnum,
  normalizeLanguageEnum,
  setLanguage,
  getLanguage,
  getLocaleCode,
  t
} from "../i18n/index.js";
import {
  listWatchfaces,
  upsert,
  removeWatchface,
  getWatchface,
  setLastActiveId,
  getLastActiveId,
  newWatchfaceId,
  BUNDLED_STARTER_WATCHFACE_ID
} from "./localWatchfacesStore.js";
import { resolveCdnFetchUrl } from "./cdnAssets.js";
import {
  buildFontLookup,
  resolveItemFontFields,
  unresolvedFontLabel
} from "./fontResolve.js";
import { APP_BUILD_NUMBER } from "./appVersion.js";
import { isDevSyncApiAvailable, saveClassifyCacheViaApi, writeDispInfoViaApi, writeFontInfoViaApi } from "./devSyncApi.js";
import { createDivoomChinaStoreJson } from "./divoomCloudApi.js";
import { buildDivoomLanEnvelope } from "./divoomLanJson.js";
import {
  downloadSelectedFontsToLocal,
  scanPendingFontsFromStore
} from "./fontCloudSync.js";
import { fetchDispItemList, summarizeDispCatalogSync } from "./dispCloudSync.js";
import { DispCatalogStore } from "./dispCatalogStore.js";
import {
  countPendingFontItems,
  loadPendingFontCacheFromStorage,
  reconcilePendingFontItems,
  savePendingFontCacheToStorage
} from "./pendingFontCache.js";
import {
  countPendingTemplateItems,
  loadPendingTemplateCacheFromStorage,
  reconcilePendingClassifyRows,
  savePendingTemplateCacheToStorage
} from "./pendingTemplateCache.js";
import {
  buildSimulatedLanDeviceList,
  getSimulatedDeviceId,
  isSimulatedDeviceMode
} from "./simulatedDevice.js";
import {
  exportWatchfaceToDirectory,
  isWatchfaceDirectoryExportSupported
} from "./watchfaceExport.js";
import {
  buildPublicAssetLookupPaths,
  collectImportAssetLeaves,
  parseWatchfaceImportJson,
  prepareConfigForLocalImport,
  resolveImportFileForLeaf
} from "./watchfaceImport.js";
import {
  classifyCatalogNeedsNameEnrichment,
  downloadSingleTemplateToLocal,
  enrichClassifyCatalogNames,
  fetchBilingualClassifyNameIndex,
  mergeClassifyCatalogSnapshots,
  pickSyncLanguage,
  scanPendingTemplatesFromDevice
} from "./templateSync.js";

const BASE_URL = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
const withBase = (rel) => BASE_URL + String(rel || "").replace(/^\//, "");

/** AstroToo 表盘逻辑分辨率（方形屏）。 */
const EDITOR_CANVAS_WIDTH = 480;
const EDITOR_CANVAS_HEIGHT = 480;

/** 本地「管理员模式」开关（仅前端展示/后续功能入口；勿作安全边界）。 */
const ADMIN_UNLOCK_STORAGE_KEY = "divoom_editor_admin_unlocked_v1";
/** 与产品约定一致；仅用于本机浏览器内验证。 */
const ADMIN_GATE_PASSWORD = "Divoom~!@#";

/** Pack ClockId for `public/defaults/starter-watchface.json` (loads `template/29` & `template/15` when present). */
const BUNDLED_STARTER_TEMPLATE_PACK_FALLBACK_ID = 342;
const LAN_DEVICE_HARDWARE_WHITELIST = new Set([500, 510, 511, 512]);
const LAN_DEVICE_HTTP_PORT = 9000;
/** 与固件 /create_local_clock、/patch_local_clock 第二段约定一致（参见 LAN Quick Reference：tarball 内 clock_bg.*）。 */
const LAN_MULTIPART_DIAL_FILENAME = "clock_bg.jpg";
/** 第二段为 gzip tar（内含 clock_bg.* 与 ItemList image_addr 叶子），与 `DialAssets: bundle` 对应。 */
const LAN_MULTIPART_BUNDLE_FILENAME = "clock_bg.tar.gz";
/** 设为 1 或在地址栏加 ?lanDebug=1 后刷新：日志区输出 multipart JSON 片段等详细信息。 */
const LAN_DEBUG_STORAGE_VERBOSE = "divoom_lan_verbose";
const LAN_DEBUG_HISTORY_MAX = 12;
/** 本地文件选择大小上限（字节）。 */
const LOCAL_FILE_PICK_MAX_BYTES = 500 * 1024;

  const DISP_NAME_MAP = Object.freeze({
    0: "APP_ITEM_NAME2",
    1: "SECOND",
    2: "MIN",
    3: "HOUR",
    4: "HOUR_MIN",
    5: "HOUR_MIN_SEC",
    6: "ENG_WEEK",
    7: "YEAR",
    8: "DAY",
    9: "MON",
    10: "HOT16",
    11: "HOT32",
    12: "CHINA_WEEK",
    13: "NET_PIC",
    14: "APP_PIC_DATA",
    15: "TIME_AM_PM",
    16: "APP_ITEM_DATA1",
    17: "APP_ITEM_NAME1",
    18: "WEATHER_GIF16",
    19: "NOISE",
    20: "CHINA_DAY",
    21: "CHINA_YEAR",
    22: "CHINA_MON",
    23: "CHINA_JIEQI",
    24: "CHINA_GOOD",
    25: "CHINA_BAD",
    26: "CHINA_CONST",
    27: "ENG_MON",
    28: "CHINA_MON_2",
    29: "CHINA_DAY_2",
    30: "CHINA_YEAR_2",
    31: "ENG_WEEK_ALL",
    32: "TEMP_DIGIT",
    33: "NOISE_DIGIT",
    34: "NOISE_IMAGE",
    35: "APP_TITLE",
    36: "MON_YEAR",
    37: "ENG_WEEK_THREE",
    38: "APP_ITEM_DATA2",
    39: "ENG_MONTH_DOT_DAY",
    40: "APP_ITEM_DATA3",
    41: "APP_ITEM_DATA4",
    42: "APP_CON_DATA",
    43: "APP_ITEM_NAME3",
    45: "APP_PICTURE",
    46: "LEFT16_PICTURE",
    47: "RIGHT16_PICTURE",
    48: "MID32_PICTURE",
    49: "TEXT_MESSAGE",
    50: "EQ_EFFECT",
    51: "COUNT_DOWN_DAY",
    52: "GAME_LEVEL",
    53: "DATE_WEEK_YEAR",
    54: "WEATHER_WORD",
    55: "WEATHER_GIF32",
    56: "MUL_TEXT_MESSAGE",
    57: "HOUR_IMAGE",
    58: "MIN_IMAGE",
    59: "HOUR_DECADE_IMAGE",
    60: "HOUR_UNIT_IMAGE",
    61: "MIN_DECADE_IMAGE",
    62: "MIN_UNIT_IMAGE",
    63: "WEATHER_GIF64",
    64: "WEATHER_GIF8",
    66: "WEEK_GIF",
    67: "HOUR_ACTIVE_GIF",
    68: "SECOND_GIF",
    69: "MON_DECADE_IMAGE",
    70: "MON_UNIT_IMAGE",
    71: "MDAY_DECADE_IMAGE",
    72: "MDAY_UNIT_IMAGE",
    73: "AM_PM_IMAGE",
    74: "WIFI_SIGNAL_IMAGE",
    75: "SINGLE_WORLD_TIME_HOUR",
    76: "SINGLE_WORLD_TIME_MIN",
    77: "SINGLE_WORLD_TIME_CITY",
    78: "USER_HEAD_IMG",
    79: "MON_ALL_IMAGE",
    80: "TOMMOROW_WEEK_TWO",
    81: "TOMMOROW_WEATHER",
    82: "TOMMOROW_MAX_TEMP",
    83: "TOMMOROW_MIN_TEMP",
    84: "AFTER_TOM_WEEK_TWO",
    85: "AFTER_TOM_WEATHER",
    86: "AFTER_TOM_MAX_TEMP",
    87: "AFTER_TOM_MIN_TEMP",
    88: "THREE_DAY_WEEK_TWO",
    89: "THREE_DAY_WEATHER",
    90: "THREE_DAY_MAX_TEMP",
    91: "THREE_DAY_MIN_TEMP",
    92: "FOUR_DAY_WEEK_TWO",
    93: "FOUR_DAY_WEATHER",
    94: "FOUR_DAY_MIN_TEMP",
    95: "FOUR_DAY_MAX_TEMP",
    96: "TODAY_MAX_TEMP",
    97: "TODAY_MIN_TEMP",
    98: "SPOTIFY_EQ_INFO",
    99: "APP_ITEM_DATA5",
    100: "APP_ITEM_DATA6",
    101: "CHINA_Y_M_D_S",
    102: "CHINA_Y_J_INFO",
    103: "CHINA_M_D_S",
    104: "RSS_NEWS_INFO",
    105: "DAY_NIGHT_FLAG",
    106: "SMALL_EQ_EFFECT",
    107: "HOUR_ACTIVE_GIF_NO_TIME",
    108: "FIVE_MIN_ACTIVE_GIF",
    109: "NEW_YEAR_COUNT_DOWN_DAY",
    110: "QR_CODE_PIC",
    111: "WEATHER_LOCAL_GIF",
    112: "APP_ITEM_DATA7",
    113: "APP_ITEM_DATA8",
    114: "APP_ITEM_DATA9",
    115: "APP_ITEM_DATA10",
    116: "APP_ITEM_DATA11",
    117: "APP_ITEM_DATA12",
    118: "APP_NET_DATA1",
    119: "APP_NET_DATA2",
    120: "APP_NET_DATA3",
    121: "APP_NET_DATA4",
    122: "APP_NET_DATA5",
    123: "APP_NET_DATA6",
    124: "WEATHER_GIF_CUSTOM",
    125: "NET5_PIC",
    126: "NET6_PIC",
    127: "NET7_PIC",
    128: "NET8_PIC",
    129: "NET9_PIC",
    130: "NET10_PIC",
    131: "HOUR_POINT_IMAGE",
    132: "MIN_POINT_IMAGE",
    133: "PIXEL_EQ_DIAL",
    134: "PIXEL_CLOUD1_DIAL",
    135: "PIXEL_USER_DEFINE1_DIAL",
    136: "PIXEL_USER_DEFINE2_DIAL",
    137: "PIXEL_USER_DEFINE3_DIAL",
    138: "PIXEL_USER_DEFINE4_DIAL",
    139: "PIXEL_USER_DEFINE5_DIAL",
    140: "PIXEL_USER_DEFINE6_DIAL",
    141: "PIXEL_USER_DEFINE7_DIAL",
    142: "PIXEL_USER_DEFINE8_DIAL",
    143: "PIXEL_USER_DEFINE9_DIAL",
    144: "PIXEL_USER_DEFINE10_DIAL",
    145: "PIXEL_CLOUD2_DIAL",
    146: "PIXEL_CLOUD3_DIAL",
    147: "WIND_SPEED",
    148: "VISIBILITY",
    149: "NOISE_HUMI_OUT",
    150: "APP_PICTURE2",
    151: "APP_PICTURE3",
    152: "APP_PICTURE4",
    153: "YEAR_MON_DAY",
    154: "NET_TEXT_MESSAGE",
    155: "USER_TEXT_MESSAGE",
    156: "MON_DAY",
    157: "LOWEST_TO_HIGHEST_TEMP",
    158: "YEAR_MONTH_ACRONYM",
    159: "DAY_WEEK_ACRONYM",
    166: "NOISE_DB",
    169: "FIRST_DAY_WEEK",
    170: "SMALL_WEEK_DAT",
    171: "WEEK_GIF_CUSTOM",
    172: "TEMP_PIC",
    173: "NET2_PIC",
    174: "NET3_PIC",
    175: "NET4_PIC",
    176: "SUNRISE_TIME",
    177: "SUNSET_TIME",
    178: "CALENDAR_EVENT_NAME",
    179: "CALENDAR_EVENT_TIME",
    180: "ENG_MON_ALL",
    181: "TEMP_GRAD_PIC",
    182: "ALARM_ICON",
    183: "HOUR_GIF",
    184: "MIN_GIF",
    185: "PIXEL_CLOUD4_DIAL",
    186: "PIXEL_CLOUD5_DIAL",
    187: "PIXEL_CLOUD6_DIAL",
    188: "PIXEL_CLOUD7_DIAL",
    189: "PIXEL_CLOUD8_DIAL",
    190: "PIXEL_VARIABLE_DIAL",
    191: "TIDAL_MOMENT",
    192: "DAY_NIGHT_FLAG2",
    193: "MONTH_DAY_YEAR",
    194: "MONTH_ABBREVIATIONS",
    195: "WEEK_ABBREVIATIONS",
    196: "YEAR_TWO_DIGITS",
    198: "DAYS_OF_LOVE",
    199: "HOUR_OF_LOVE",
    200: "MIN_OF_LOVE",
    201: "SEC_OF_LOVE",
    202: "HALLOW_DAY",
    203: "CHRISTMAS_DAY",
    204: "SUNRISE_SUNSET_TIME",
    205: "SUNRISE_SUNSET_COUNTDOWN",
    206: "SUNRISE_SUNSET_PIC",
    207: "PHASE_MOON",
    208: "PHASE_MOON_NAME",
    209: "PHASE_MOON2",
    210: "PHASE_MOON3",
    211: "PHASE_MOON_NAME2",
    212: "PHASE_MOON_NAME3",
    213: "SECOND_DAY_WEEK_CAP",
    214: "THIRD_DAY_WEEK_CAP",
    215: "SECOND_DAY",
    216: "THIRD_DAY",
    217: "PHASE_MOON_NAME1",
    218: "SUNRISE_SUNSET_PIC2",
    219: "MUSIC_TITLE",
    220: "MUSIC_WORD",
    221: "PIXEL_CLOUD9_DIAL",
    222: "PIXEL_CLOUD10_DIAL",
    223: "PIXEL_EQ2_DIAL",
    224: "PIXEL_EQ3_DIAL",
    225: "PIXEL_EQ4_DIAL",
    226: "PIXEL_EQ5_DIAL",
    227: "PIXEL_EQ6_DIAL",
    228: "PIXEL_EQ7_DIAL",
    229: "PIXEL_EQ8_DIAL",
    230: "PIXEL_EQ9_DIAL",
    231: "PIXEL_EQ10_DIAL",
    232: "DIVOOM_APP_ANIMATION",
    233: "SECOND_POINT_IMAGE",
    234: "PHOTO_ALBUM",
    236: "SET_COMPONENT_TIME_STYLE",
    237: "SET_COMPONENT_DATE_STYLE",
    238: "TODAY_MAX_TEMP_H",
    239: "TODAY_MIN_TEMP_L",
    240: "WEBP_WEATHER",
    241: "CALENDAR_DATES",
    242: "HOUR_MIN_COLOR",
    243: "SYS_ANIMATION",
    244: "WEEK_ALL_FRIST_BIG",
    245: "CALENDAR_WATCH",
    246: "APP_ITEM_DATA13",
    247: "APP_ITEM_DATA14",
    248: "APP_ITEM_DATA15",
    249: "APP_ITEM_DATA16",
    250: "APP_ITEM_DATA17",
    251: "APP_ITEM_DATA18",
    252: "APP_ITEM_DATA19",
    253: "APP_ITEM_DATA20",
    254: "TEMP_DIGIT2",
    255: "TOMMOROW_LOWEST_TEMP_TO_HIGHEST_TEMP",
    256: "AFTER_TOM_LOWEST_TEMP_TO_HIGHEST_TEMP",
    257: "THREE_DAY_LOWEST_TEMP_TO_HIGHEST_TEMP",
    258: "FOUR_DAY_LOWEST_TEMP_TO_HIGHEST_TEMP",
    259: "WEEK_MONTH_DAY",
    260: "WEBP_FULL_WEATHER",
    261: "DIAL_COMPONENT_START",
    279: "DIAL_COMPONENT_END",
    281: "TIME_DIGIT_IMAGE0",
    282: "TIME_DIGIT_IMAGE1",
    283: "TIME_DIGIT_IMAGE2",
    284: "TIME_DIGIT_IMAGE3",
    285: "TIME_DIGIT_IMAGE4",
    286: "TIME_DIGIT_IMAGE5",
    287: "TIME_DIGIT_IMAGE6",
    288: "TIME_DIGIT_IMAGE7",
    289: "TIME_DIGIT_IMAGE8",
    290: "TIME_DIGIT_IMAGE9",
    291: "DIY_TEXT_MESSAGE1",
    292: "DIY_TEXT_MESSAGE2",
    293: "DIY_TEXT_MESSAGE3",
    294: "DIY_TEXT_MESSAGE4",
    295: "DIY_TEXT_MESSAGE5",
    296: "DIY_TEXT_MESSAGE6",
    297: "FIVE_DAY_WEATHER",
    298: "SIX_DAY_WEATHER",
    299: "FIVE_DAY_MAX_TEMP",
    300: "FIVE_DAY_MIN_TEMP",
    301: "SIX_DAY_MAX_TEMP",
    302: "SIX_DAY_MIN_TEMP",
    303: "FIVE_DAY_WEEK_TWO",
    304: "SIX_DAY_WEEK_TWO",
    305: "FIVE_DAY_LOWEST_TEMP_TO_HIGHEST_TEMP",
    306: "SIX_DAY_LOWEST_TEMP_TO_HIGHEST_TEMP",
    307: "CALENDAR_WATCH2",
    308: "CALENDAR_WATCH3",
    309: "CALENDAR_WATCH4",
    310: "HOUR_FORMAT",
    311: "HOUR_CONTDOWN",
    312: "MIN_CONTDOWN",
    313: "SEC_CONTDOWN",
    314: "AUTHOR_HEAD_IMG",
    315: "AUTHOR_NICK_NAME",
    316: "IMAGE_NAME",
    317: "APP_ITEM_DATA21",
    318: "APP_ITEM_DATA22",
    319: "APP_ITEM_DATA23",
    320: "APP_ITEM_DATA24",
    321: "APP_ITEM_DATA25",
    322: "APP_ITEM_DATA26",
    323: "APP_ITEM_DATA27",
    324: "APP_ITEM_DATA28",
    325: "APP_ITEM_DATA29",
    326: "APP_ITEM_DATA30",
    327: "APP_ITEM_DATA31",
    328: "APP_ITEM_DATA32",
    329: "APP_ITEM_DATA33",
    330: "APP_ITEM_DATA34",
    331: "APP_ITEM_DATA35",
    332: "APP_ITEM_DATA36",
    333: "APP_ITEM_DATA37",
    334: "APP_ITEM_DATA38",
    335: "APP_ITEM_DATA39",
    336: "APP_ITEM_DATA40",
    337: "MONTH_ACRONYM_TWO",
    338: "WIND_SPEED_ONLY",
    339: "TEMP_DIGIT3",
    340: "ATMOSPHERIC_PRESSURE",
    341: "MONTH_FULL_NAME",
    342: "HUMI_ONLY_NUM",
    343: "MONG_DATE_WEEK",
    344: "CALENDAR_WATCH5",
    345: "CALENDAR_WATCH6",
    346: "TEXT_TITLE",
    347: "CALENDAR_WATCH7",
    348: "ROT_IMG_EFFECT_1",
    349: "ROT_IMG_EFFECT_2",
    350: "ROT_IMG_EFFECT_3",
    351: "CALENDAR_WATCH8",
    352: "ROT_IMG_EFFECT_4",
    354: "TIME_PLAN_COUNT_DOWN_TIME",
    355: "TIME_PLAN_DISP_TIME",
    356: "DIALY_DISP_TIME",
    357: "DIALY_DISP_NAME",
    358: "TIME_PLAN_DISP_NAME",
    359: "ROTATE_MUL_IMAGE",
    360: "LABOR_DAY_COUNTDOWN",
    361: "DAY_OF_THE_DEAD_COUNTDOWN",
    362: "CHILDREN_DAY_COUNTDOWN",
    363: "VALENTINE_DAY_COUNTDOWN",
    364: "APP_PICTURE_URL",
    365: "SPECIAL_YEAR_MONTH_DAY",
    366: "SPECIAL_PASSED_YEAR",
    367: "SPECIAL_PASSED_MONTH",
    368: "SPECIAL_PASSED_DAY",
    369: "SPECIAL_PASSED_HOUR",
    370: "SPECIAL_PASSED_MIN",
    371: "SPECIAL_PASSED_SEC",
    372: "TEXT_MESSAGE2",
    373: "TEXT_MESSAGE3",
    374: "TEXT_MESSAGE4",
    375: "TEXT_MESSAGE5",
    376: "WEATHER_WORD_CN",
    377: "WEEK_CN",
    378: "MONTH_DAY_CN",
    379: "WEEK_ABBREVIATIONS_CN",
    380: "TOMMOROW_WEEK_TWO_CN",
    381: "AFTER_TOM_WEEK_TWO_CN",
    382: "THREE_DAY_WEEK_TWO_CN",
    383: "FOUR_DAY_WEEK_TWO_CN",
    384: "MONTH_DAY_WEEK_CN",
    385: "MONTH_CN",
    386: "CHINA_TAISHEN",
    387: "CHINA_JIAZIWUXING",
    388: "CHINA_PENGZU",
    389: "CHINA_CHONG",
    390: "WORLD_HOUR_POINT",
    391: "WORLD_MIN_POINT",
    392: "CALENDAR_WATCH9",
    394: "PHOTO_ALBUM2",
    395: "PHOTO_ALBUM3",
    396: "PHOTO_ALBUM4",
    397: "TODO_LIST",
    398: "TEXT_MESSAGE6",
    399: "TEXT_MESSAGE7",
    400: "TEXT_MESSAGE8",
    401: "TEXT_MESSAGE9",
    402: "TEXT_MESSAGE10",
    403: "CALENDAR_WATCH10",
    404: "CALENDAR_WATCH11",
    405: "CALENDAR_WATCH12",
    406: "HOUR_DECADE",
    407: "HOUR_UNIT",
    408: "MIN_DECADE",
    409: "MIN_UNIT",
    410: "TEXT_MESSAGE_AUTO_WRAPS",
    411: "TEXT_MESSAGE2_AUTO_WRAPS",
    412: "TEXT_MESSAGE3_AUTO_WRAPS",
    413: "TEXT_MESSAGE4_AUTO_WRAPS",
    414: "TEXT_MESSAGE5_AUTO_WRAPS",
    415: "TEXT_MESSAGE6_AUTO_WRAPS",
    416: "TEXT_MESSAGE7_AUTO_WRAPS",
    417: "TEXT_MESSAGE8_AUTO_WRAPS",
    418: "TEXT_MESSAGE9_AUTO_WRAPS",
    419: "TEXT_MESSAGE10_AUTO_WRAPS",
    420: "CALENDAR_WATCH13",
    421: "CALENDAR_WATCH14",
    423: "CALENDAR_WATCH15",
    426: "COUNT_DOWN_DAY_1",
    427: "MIN_CONTDOWN_1",
    428: "GOOGLE_CALENDAR_TODO_LIST",
    429: "PHOTO_ALBUM5",
    430: "PHOTO_ALBUM6",
    431: "PHOTO_ALBUM7",
    432: "PHOTO_ALBUM8",
    433: "PHOTO_ALBUM9",
    434: "PHOTO_ALBUM10",
    435: "PHOTO_ALBUM11",
    436: "PHOTO_ALBUM12",
    437: "PHOTO_ALBUM13",
    438: "PHOTO_ALBUM14",
    439: "PHOTO_ALBUM15",
    440: "PHOTO_ALBUM16",
    441: "PHOTO_ALBUM17",
    442: "PHOTO_ALBUM18",
    443: "PHOTO_ALBUM19",
    444: "PHOTO_ALBUM20",
    445: "TODAY_WEATHER",
    446: "PHOTO_ALBUMID1",
    447: "PHOTO_ALBUMID2",
    448: "TEXT_MESSAGE11",
    449: "TEXT_MESSAGE12",
    450: "TEXT_MESSAGE13",
    451: "TEXT_MESSAGE14",
    452: "TEXT_MESSAGE15",
    453: "TEXT_MESSAGE16",
    454: "HUMI_LEVEL",
    455: "CALENDAR_WATCH16",
    456: "CHINESE_HOUR_IMAGE",
    457: "SENTENCE_OF_THE_DAY",
    458: "WORD_OF_THE_DAY",
    459: "CALENDAR_WATCH17",
    460: "STOCK_LINE",
    461: "SOLAR_TERMS_IMAGE",
    462: "VISIBILITY_LEVEL",
    463: "ATMOSPHERIC_PRESSURE_LEVEL",
    464: "TEMP_LEVEL",
    465: "CUSTOM_CLOUD_PHOTO",
    466: "SEC_DECADE",
    467: "SEC_UNIT",
    468: "WEEK_MONTH_ALL_DAY",
    469: "CALENDAR_WATCH18",
    470: "MARBLE",
    471: "VIDEO_DISP",
    472: "CALENDAR_WATCH19",
    473: "TODAY_TIME_CHANGE",
    474: "LUNAR_MON_AND_DAY",
    475: "SPRING_FESTIVAL_IMAGE",
    476: "ENGLISH_NOW_DISP",
    477: "NEXT_FIRST_HOUR_TEXT",
    478: "NEXT_SECOND_HOUR_TEXT",
    479: "NEXT_THIRD_HOUR_TEXT",
    480: "NOW_WEATHER_IMAGE",
    481: "NEXT_FIRST_WEATHER_IMAGE",
    482: "NEXT_SECOND_WEATHER_IMAGE",
    483: "NEXT_THIRD_WEATHER_IMAGE",
    484: "NEXT_FOURTH_WEATHER_IMAGE",
    485: "NEXT_FOURTH_TEXT",
    486: "NEXT_FIRST_HOUR_TEMP",
    487: "NEXT_SECOND_HOUR_TEMP",
    488: "NEXT_THIRD_HOUR_TEMP",
    489: "NEXT_FOURTH_HOUR_TEMP",
    490: "MUSIC_SINGER",
    491: "MUSIC_PREV_WORD",
    492: "BATTERY"
  });

  const DISP_COMMENT_ZH_MAP = Object.freeze({
    0: "app单元项标题    暂时不会使用",
    1: "时间秒",
    2: "时间分",
    3: "时间小时",
    4: "小时：分钟",
    5: "小时:分钟:钞",
    6: "星期英文",
    7: "年　（数字）",
    8: "日（数字）",
    9: "月（数字）",
    10: "推荐图库16",
    11: "推荐图库32",
    12: "星期中文",
    13: "网络图库",
    14: "app图片加数据",
    15: "此标记只有在１２小时制才能显示,上下午标记",
    16: "app单元项数据",
    17: "app单元项标题",
    18: "天气16的图",
    19: "噪音",
    20: "农历日 天干地支",
    21: "农历年　天干地支",
    22: "农历月　　天干地支",
    23: "农历节气",
    24: "农历宜做",
    25: "农历忌",
    26: "星座",
    27: "英文    jan",
    28: "农历月(正月，腊月)",
    29: "农历日(初一，十五)",
    30: "农历年(牛年)",
    31: "星期英文(全字母)",
    32: "温度数字显示",
    33: "噪音数字显示",
    34: "噪音图像显示",
    35: "app显示主题,人名或者文章标题",
    36: "月－年（数字）",
    37: "星期英文三个字母缩写)",
    38: "app单元项数据",
    39: "英文月点数字日",
    40: "app单元项数据",
    41: "app单元项数据",
    42: "app显示数据轮播",
    43: "app单元项标题暂时不会使用",
    45: "app显示图片信息",
    46: "显示图片信息　对应config里面的LeftPic              id = 0",
    47: "显示图片信息        对应config里面的RightPic       id = 1",
    48: "显示图片３２信息          对应config里面的MidPic       id = 2",
    49: "文字提醒框           对应config里面的UserMessage",
    50: "EQ效果",
    51: "倒计时天数据显示           对应config里面的CountDownDate",
    52: "游戏等级显示",
    53: "数字日期-三位英文月份-年份",
    54: "天气文字",
    55: "天气32的图",
    56: "多行文字提醒框           对应config里面的UserMessage",
    57: "时间小时图像       id = 3",
    58: "时间分钟图像",
    59: "时间小时十位图像",
    60: "时间小时个位图像",
    61: "时间分钟十位图像",
    62: "时间分钟个位图像",
    63: "天气64的图",
    64: "天气8的图",
    66: "星期用图形表示",
    67: "整点报时",
    68: "时间秒图像",
    69: "时间月十位图像",
    70: "时间月个位图像",
    71: "时间日十位图像",
    72: "时间日个位图像",
    73: "ＡＭ-ＰＭ显示图像",
    74: "wifi信号强度",
    75: "某个世界时间小时",
    76: "某个世界时间分钟",
    77: "某个世界时间城市名",
    78: "用户头像",
    79: "日期月的图像",
    80: "明天的星期二英文字母",
    81: "明天的天气",
    82: "明天的最高气温",
    83: "明天的最低气温",
    84: "后天星期两字母",
    85: "后天的天气",
    86: "后天最高温度",
    87: "后天最低温度",
    88: "大后天星期两字母",
    89: "大后天的天气",
    90: "大后天最高温度",
    91: "大后天最低温度",
    92: "后后天星期两字母",
    93: "后后天的天气",
    94: "后后天的最低温度",
    95: "后后天的最高温度",
    96: "当天最高气温",
    97: "当天最低气温",
    98: "spotify音乐ＥＱ",
    99: "app单元项数据",
    100: "app单元项数据",
    101: "农历年月日生肖",
    102: "农历宜忌混合",
    103: "农历月日",
    104: "RSS新闻显示",
    105: "白天黑夜模式",
    106: "小区域EQ效果",
    107: "整点报时, 不显示时间",
    108: "五分钟间隔显示",
    109: "新年倒计时显示",
    110: "二维码显示",
    111: "本地天气GIF",
    112: "app单元项数据7",
    113: "app单元项数据8",
    114: "app单元项数据9",
    115: "app单元项数据10",
    116: "app单元项数据11",
    117: "app单元项数据12",
    118: "app网络数据1",
    119: "app网络数据2",
    120: "app网络数据3",
    121: "app网络数据4",
    122: "app网络数据5",
    123: "app网络数据6",
    124: "用户天气表盘",
    125: "网络图库5",
    126: "网络图库6",
    127: "网络图库7",
    128: "网络图库8",
    129: "网络图库9",
    130: "网络图库10",
    131: "时间小时指针：须使用正方形指针图（像素比 1:1）；与分针 disp132、秒针 disp233 三者共用同一组正方形布局框（x/y/w/h 完全一致且 w=h）。绕框几何中心 (x+w/2,y+h/2) 旋转；素材在未旋转时应让尖端朝向画布正上方（12 点基准）。层级 hier：时针最小、秒针最大（惯例 hier 1/2/3）。",
    132: "时间分钟指针：规则与 disp131 相同——正方形指针图、与时针 disp131、秒针 disp233 共用同一正方形 x/y/w/h（w=h）、绕框中心旋转、12 点方向为尖端朝上；hier 介于时针与秒针之间。",
    133: "eq律动表盘",
    134: "云图推荐1表盘",
    135: "云图自定义1表盘",
    136: "云图自定义2表盘",
    137: "云图自定义3表盘",
    138: "云图自定义4表盘",
    139: "云图自定义5表盘",
    140: "云图自定义6表盘",
    141: "云图自定义7表盘",
    142: "云图自定义8表盘",
    143: "云图自定义9表盘",
    144: "云图自定义10表盘",
    145: "云图推荐2表盘",
    146: "云图推荐3表盘",
    147: "风速",
    148: "可见度",
    149: "室外湿度",
    150: "app显示图片信息2",
    151: "app显示图片信息3",
    152: "app显示图片信息4",
    153: "年/月/日",
    154: "用户网络数据",
    155: "用户自定义数据",
    156: "月/日",
    157: "当日最低温度到最高温度 12C-23C",
    158: "年.月英文缩写",
    159: "日数字.星期大写缩写",
    166: "噪音数字+db",
    169: "今天",
    170: "星期大小写",
    171: "用户星期显示",
    172: "摄氏度/华氏度图片",
    173: "网络图库2",
    174: "网络图库3",
    175: "网络图库4",
    178: "日历活动标题",
    179: "日历活动时间",
    180: "月份全拼",
    181: "温度梯度变化",
    182: "闹钟图标显示",
    183: "时间小时图像  不适配底图     id = 3",
    184: "时间分钟图像 不适配底图",
    185: "云图推荐4表盘",
    186: "云图推荐5表盘",
    187: "云图推荐6表盘",
    188: "云图推荐7表盘",
    189: "云图推荐8表盘",
    190: "边框表盘中的像素艺术位置",
    191: "潮汐曲线",
    192: "白天黑夜模式",
    193: "月日年（年两位数字）",
    194: "月份大小写缩写",
    195: "星期大小写两位",
    196: "年份两位数字",
    198: "恋爱天数",
    199: "恋爱小时",
    200: "恋爱分钟",
    201: "恋爱秒",
    202: "万圣节倒计时",
    203: "圣诞节倒计时",
    204: "日出日落时间，日出时间到立马显示日落时间，反之亦然",
    205: "日出日落倒计时",
    206: "日出日落显示图",
    207: "月相图",
    208: "月相名称",
    209: "明天月相图",
    210: "后天月相图",
    211: "明天月相名称",
    212: "后天月相名称",
    213: "明天星期三位大写",
    214: "后天星期三位大写",
    215: "明天号数",
    216: "后天号数",
    217: "今天月相名称",
    218: "日出日落显示图2",
    219: "歌名",
    220: "歌词",
    221: "云图推荐9表盘",
    222: "云图推荐10表盘,使用在播放列表中",
    223: "eq2律动表盘",
    224: "eq3律动表盘",
    225: "eq4律动表盘",
    226: "eq5律动表盘",
    227: "eq6律动表盘",
    228: "eq7律动表盘",
    229: "eq8律动表盘",
    230: "eq9律动表盘",
    231: "eq10律动表盘",
    232: "DIVOOM APP发过来的动画",
    233: "时间秒钟指针：规则与 disp131 相同——正方形指针图、与时针分针共用同一正方形 x/y/w/h（w=h）、绕框中心旋转、12 点方向为尖端朝上；hier 设为三张指针中最大，使秒针绘在最上层。",
    234: "相册显示",
    236: "组件时间样式",
    237: "组件日期格式",
    238: "当天最高气温H",
    239: "当天最低气温L",
    240: "webp天气图",
    241: "日历号数 1~17",
    242: "小时/冒号/分钟单独调色",
    243: "DIVOOM 系统发过来的动画",
    244: "星期全称首字母大写",
    245: "日历表1显示(370*230、不带星期)",
    246: "app单元项数据13",
    247: "app单元项数据14",
    248: "app单元项数据15",
    249: "app单元项数据16",
    250: "app单元项数据17",
    251: "app单元项数据18",
    252: "app单元项数据19",
    253: "app单元项数据20",
    254: "温度数字显示(只带°)",
    255: "明天最低温到最高温",
    256: "后天最低温到最高温",
    257: "大后天最低温到最高温",
    258: "后后天最低温到最高温",
    259: "星期全称大小写,月份缩写大小写,号数",
    260: "webp全屏天气，10张图",
    261: "子表盘组件开始ID",
    279: "子表盘组件结束ID",
    281: "时间数字0,这个在显示时显示小时十位",
    282: "时间数字1，这个在显示时显示小时个位",
    283: "时间数字2,这个在显示时显示分钟十位",
    284: "时间数字3,这个在显示时显示分钟个位",
    285: "时间数字4",
    286: "时间数字5",
    287: "时间数字6",
    288: "时间数字7",
    289: "时间数字8",
    290: "时间数字9",
    291: "用户自定义文本",
    292: "用户自定义文本",
    293: "用户自定义文本",
    294: "用户自定义文本",
    295: "用户自定义文本",
    296: "用户自定义文本",
    297: "第五天的天气",
    298: "第六天的天气",
    299: "第五天的最高温度",
    300: "第五天的最低温度",
    301: "第六天的最高温度",
    302: "第六天的最低温度",
    303: "第五天星期两字母",
    304: "第六天星期两字母",
    305: "第五天最低温到最高温",
    306: "第六天最低温到最高温",
    307: "日历表显示2(231*148、带星期)",
    308: "日历表显示3(322*240、带星期)",
    309: "日历表显示4(314*234、带星期)",
    310: "12-24小时制",
    311: "时钟倒计时",
    312: "分钟倒计时",
    313: "秒钟倒计时",
    314: "作者头像",
    315: "作者昵称",
    316: "作品名称",
    317: "app单元项数据21",
    318: "app单元项数据22",
    319: "app单元项数据23",
    320: "app单元项数据24",
    321: "app单元项数据25",
    322: "app单元项数据26",
    323: "app单元项数据27",
    324: "app单元项数据28",
    325: "app单元项数据29",
    326: "app单元项数据30",
    327: "app单元项数据31",
    328: "app单元项数据32",
    329: "app单元项数据33",
    330: "app单元项数据34",
    331: "app单元项数据35",
    332: "app单元项数据36",
    333: "app单元项数据37",
    334: "app单元项数据38",
    335: "app单元项数据39",
    336: "app单元项数据40",
    337: "月英文2位缩写",
    338: "风速(不带单位)",
    339: "温度数字显示(带℃/℉)",
    340: "气压(带hPa)",
    341: "月份大小写全称",
    342: "湿度纯数字显示（%在底图）",
    343: "月(英文大写3位)-日-星期(大写3位)",
    344: "日历表显示5",
    345: "日历表显示6(318*170、带星期)",
    346: "文字提醒框   标题        对应config里面的UserTitle",
    347: "日历表显示7(293*199、带星期)",
    348: "图像旋转效果1（单图 ROT_IMG / mul_flag=0）",
    349: "图像旋转效果2（单图 ROT_IMG / mul_flag=0）",
    350: "图像旋转效果3（单图 ROT_IMG / mul_flag=0）",
    351: "日历表显示8(370*230、带星期)",
    352: "图像旋转效果4（单图 ROT_IMG / mul_flag=0）",
    354: "时间安排倒计时（分钟:秒）",
    355: "时间安排时间段显示",
    356: "纪念日显示时间",
    357: "纪念日显示名称",
    358: "时间安排显示名称",
    359: "多张图旋转",
    360: "劳动节倒计时 5/1",
    361: "亡灵日倒计时 11/1",
    362: "儿童节倒计时 6/1",
    363: "情人节倒计时 2/14",
    364: "app显示图片外部URL",
    365: "显示特定的年.月.日",
    366: "正计时-年（不带单位）",
    367: "正计时-月（不带单位）",
    368: "正计时-日（不带单位）",
    369: "正计时-小时（不带单位）",
    370: "正计时-分钟（不带单位）",
    371: "正计时-秒（不带单位）",
    372: "文字提醒框   2        对应config里面的UserMessage2",
    373: "文字提醒框   3        对应config里面的UserMessage3",
    374: "文字提醒框   4        对应config里面的UserMessage4",
    375: "文字提醒框   5       对应config里面的UserMessage5",
    376: "中文天气类型（晴）",
    377: "中文星期（星期一）",
    378: "中文月份日期（12月15日）",
    379: "中文星期简写（周一）",
    380: "第二天中文星期简写（周一）",
    381: "第三天中文星期简写（周一）",
    382: "第四天中文星期简写（周一）",
    383: "第五天中文星期简写（周一）",
    384: "中文月份日期星期（12月25日 星期三）",
    385: "中文月份（一月）",
    386: "胎神位置",
    387: "甲子五行",
    388: "彭祖百忌",
    389: "冲煞",
    390: "世界时间时针",
    391: "世界时间分针",
    392: "日历表显示9(325*221,不带星期, 极简时光特有)",
    394: "相册2显示",
    395: "相册3显示",
    396: "相册4显示",
    397: "计划清单",
    398: "文字提醒框   6       对应config里面的UserMessage6",
    399: "文字提醒框   7       对应config里面的UserMessage7",
    400: "文字提醒框   8       对应config里面的UserMessage8",
    401: "文字提醒框   9       对应config里面的UserMessage9",
    402: "文字提醒框   10       对应config里面的UserMessage10",
    403: "日历表10显示(325*221、不带星期,图标用图)",
    404: "日历表11显示(248*210 带星期单字母）",
    405: "日历表12显示(370*230、带星期单字母)",
    406: "时间小时十位（数字 0~2，仅取小时高位）",
    407: "时间小时个位（数字 0~9，仅取小时低位）",
    408: "时间分钟十位（数字 0~5，仅取分钟高位）",
    409: "时间分钟个位（数字 0~9，仅取分钟低位）",
    410: "文字提醒框1自动换行",
    411: "文字提醒框2自动换行",
    412: "文字提醒框3自动换行",
    413: "文字提醒框4自动换行",
    414: "文字提醒框5自动换行",
    415: "文字提醒框6自动换行",
    416: "文字提醒框7自动换行",
    417: "文字提醒框8自动换行",
    418: "文字提醒框9自动换行",
    419: "文字提醒框10自动换行",
    420: "日历表显示13(293*199、带星期单字母)",
    421: "日历表显示14(258*240、带星期三字母,图标用图)",
    423: "日历表显示15(506*238、不带星期, 图标用图)",
    426: "倒计时天数-1显示           对应config里面的CountDownDate",
    427: "分钟倒计时+1",
    428: "谷歌日历待办事项",
    429: "相册5显示",
    430: "相册6显示",
    431: "相册7显示",
    432: "相册8显示",
    433: "相册9显示",
    434: "相册10显示",
    435: "相册11显示",
    436: "相册12显示",
    437: "相册13显示",
    438: "相册14显示",
    439: "相册15显示",
    440: "相册16显示",
    441: "相册17显示",
    442: "相册18显示",
    443: "相册19显示",
    444: "相册20显示",
    445: "今天天气",
    446: "显示PhotoAlbumId1不播视频",
    447: "显示PhotoAlbumId2不播视频",
    448: "文字提醒框11       对应config里面的UserMessage11",
    449: "文字提醒框12       对应config里面的UserMessage12",
    450: "文字提醒框13       对应config里面的UserMessage13",
    451: "文字提醒框14       对应config里面的UserMessage14",
    452: "文字提醒框15       对应config里面的UserMessage15",
    453: "文字提醒框16       对应config里面的UserMessage16",
    454: "湿度等级图像（分七个等级）",
    455: "日历表16显示(340*221、不带星期,图标用图)",
    456: "十二时辰图片显示",
    457: "每日短句",
    458: "每日一词",
    459: "日历表17显示(370*300、不带星期,图标用图)",
    460: "股票曲线",
    461: "节气（节日）图像",
    462: "可见度等级图像（分七个等级）",
    463: "气压等级图像（分七个等级）",
    464: "温度等级图像（分七个等级）",
    465: "客户定制云相册",
    466: "秒钟十位数字(TTF字体)",
    467: "秒钟个位数字(TTF字体)",
    468: "星期全称大小写,月份全称大小写 日",
    469: "日历表显示18（318*170，单字母）",
    470: "弹珠（弹珠游戏表盘专属）",
    471: "视频显示",
    472: "日历表显示19（544*187，不带星期，图标用图）",
    473: "当天时间变化图",
    474: "农历月日四字（正月初一）",
    475: "新春图像（马年除夕到十五显示不同图像，除夕前和十五后不同图像）",
    476: "现在英文显示（Now）",
    477: "接下来的第一个整点时间显示（09:00）",
    478: "接下来的第二个整点时间显示（10:00）",
    479: "接下来的第三个整点时间显示（11:00）",
    480: "现在天气图像",
    481: "接下来的第一个整点天气图像",
    482: "接下来的第二个整点天气图像",
    483: "接下来的第三个整点天气图像",
    484: "接下来的第四个整点天气图像",
    485: "接下来的第四个整点时间显示（12:00）",
    486: "接下来的第一个整点温度（20°）",
    487: "接下来的第二个整点温度（20°）",
    488: "接下来的第三个整点温度（20°）",
    489: "接下来的第四个整点温度（20°）",
    490: "歌手",
    491: "上一句歌词",
    492: "电池电量（10 张图，按电量等级 0~9 切换）"
  });

  const IMAGE_DISP_IDS = new Set([
    13, 14, 18, 34, 45, 46, 47, 48, 55, 57, 58, 59, 60, 61, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74,
    78, 79, 81, 85, 89, 93, 98, 105, 107, 108, 110, 111, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133,
    134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 150, 151, 152, 171, 172, 173, 174,
    175, 182, 183, 184, 185, 186, 187, 188, 189, 190, 206, 207, 208, 209, 210, 211, 212, 217, 218, 221,
    222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 240, 245, 260, 281, 282, 283, 284,
    285, 286, 287, 288, 289, 290, 297, 298, 310, 348, 349, 350, 352, 359, 364, 390, 391, 394, 395, 396,
    403, 421, 423, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445,
    446, 447, 454, 455, 456, 459, 461, 462, 463, 464, 465, 470, 471, 472, 473, 475, 480, 481, 482, 483,
    484, 492
  ]);

  /** DIVOOM_CLOCK_DISP_SUPPORT_ROTAETE_IMAGE1..4 —— divoom_disp_clock.c / dial_menu ROTATE_IMAGE（mul_flag=0） */
  const ROTATE_SINGLE_IMAGE_DISP_IDS = new Set([348, 349, 350, 352]);

  const POINTER_DISP_IDS = new Set([
    131, 132, 233, 390, 391
  ]);
  /** Editor preview: DIVOOM_CLOCK_DISP_SUPPORT_PHOTO_ALBUM*, PHOTO_ALBUMID*, CUSTOM_CLOUD_PHOTO — demo strip from public/pic */
  const PHOTO_ALBUM_PREVIEW_DISP_IDS = new Set([
    234,
    394,
    395,
    396,
    429,
    430,
    431,
    432,
    433,
    434,
    435,
    436,
    437,
    438,
    439,
    440,
    441,
    442,
    443,
    444,
    446,
    447,
    465
  ]);
  const PHOTO_ALBUM_PREVIEW_ROTATE_MS = 3000;

  const NETWORK_TEXT_DISP_IDS = new Set([118, 119, 120, 121, 122, 123, 154, 155]);
  const MULTI_LINE_DISP_IDS = new Set([56, 154, 155, 104, 220]);
  const APP_DATA_DISP_IDS = new Set([16, 38, 40, 41, 42, 99, 100, 112, 113, 114, 115, 116, 117, 246, 247, 248]);
  const PREVIEW_TICK_MS = 100;
  const TEMPLATE_IMAGE_SLOT_COUNT = 128;
  const TEMPLATE_SCAN_CONCURRENCY = 16;
  const TEMPLATE_NAME_SCAN_CONCURRENCY = 8;
  const TEMPLATE_SCAN_MIN_ID = 1;
  const TEMPLATE_SCAN_DEFAULT_MAX_ID = 2000;
  const TEMPLATE_CONFIG_DIR = withBase("template/config/");
  const TEMPLATE_DIR_15 = withBase("template/15/");
  const TEMPLATE_DIR_29 = withBase("template/29/");
  /** template/33 预览缩略图文件名：ClockId + 1（与 template/15 底图等资源命名规则一致）。 */
  const TEMPLATE_PREVIEW_DIR_33 = withBase("template/33/");
  const TEMPLATE_ORGANIZE_REPORT_PATH = withBase("template/organize-report.json");
  const TEMPLATE_CLASSIFY_CACHE_PATH = withBase("template/classify-cache.json");
  const TEMPLATE_BG_EXT_CANDIDATES = [".bin", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const TEMPLATE_PREVIEW_EXT_CANDIDATES = [".png", ".jpg", ".jpeg", ".webp"];
  const TEMPLATE_IMG_EXT_CANDIDATES = [".bin", ".png", ".webp", ".gif", ".jpg", ".jpeg"];
  const TEMPLATE_CLASSIFY_FALLBACK = Object.freeze({
    ReturnCode: 0,
    ReturnMessage: "",
    ClassifyList: [
      {
        ClassifyId: 58,
        ClassifyNameEn: "Styled Photo Frames",
        ClassifyName: "风格相框",
        clockid: [999, 997, 863, 840, 874, 873, 648, 757, 761, 467, 459, 748, 428, 542, 540, 541, 539, 543, 544, 545, 362, 466, 286, 833, 568, 839, 1200, 1096, 976, 975, 974, 952, 951, 843, 844, 778, 684, 842, 644, 977, 978, 979, 980, 982, 981, 830, 770, 773, 652, 749, 650, 832, 831, 457, 574, 577, 444, 849, 848, 760, 1000, 973, 1198, 772, 1107, 546, 1432]
      },
      {
        ClassifyId: 116,
        ClassifyNameEn: "Artists’ Gallery",
        ClassifyName: "艺术家联名",
        clockid: [679, 693, 698, 704, 705, 712, 732, 735, 745, 737, 709, 708, 710, 747, 721, 729, 752, 736, 734, 875, 941, 998]
      },
      {
        ClassifyId: 4,
        ClassifyNameEn: "Classic",
        ClassifyName: "通用",
        clockid: [1564, 865, 446, 257, 335, 285, 469, 447, 1202, 270, 1493, 341, 339, 348, 1424, 345, 337, 309, 284, 282, 32, 347, 288, 12, 1397, 1425, 342, 343, 283, 1399, 440, 750, 771, 417, 427, 429, 430, 1401, 601, 938, 939, 579, 600, 655, 667, 253, 767, 845, 1201, 27, 1199, 841, 846, 847, 290, 291, 364, 310, 31, 34, 25, 26, 33, 344, 271, 289, 28, 263, 441, 261, 306, 346, 255, 262, 836, 336, 5, 308, 256, 1398, 1491, 1505]
      },
      {
        ClassifyId: 48,
        ClassifyNameEn: "Festival",
        ClassifyName: "节日",
        clockid: [1503, 1504, 1499, 1500, 1501, 1502, 1496, 1497, 1498, 99, 1508, 1507, 1509, 1506, 1440, 1436, 1444, 1437, 1438, 1439, 1144, 450, 1143, 1142, 454, 367, 707, 1510, 1511, 838, 453, 451, 572, 573, 768, 769, 1001, 984, 959, 960, 961, 100, 954, 955, 994, 452, 837, 442, 366, 98, 97, 465, 365, 996, 958, 956, 995, 953, 1151, 1150, 1149, 1148, 1147, 1146, 1152, 1145]
      },
      {
        ClassifyId: 118,
        ClassifyNameEn: "Anniversaries",
        ClassifyName: "纪念日",
        clockid: [460, 461, 535, 706, 738, 739, 945, 946, 947, 576, 681, 682, 774, 775, 776, 777, 779, 443, 472, 473, 528, 531, 536, 683, 983, 474, 534, 688, 699, 567, 458, 477, 476, 834, 835]
      },
      {
        ClassifyId: 120,
        ClassifyNameEn: "City Tour",
        ClassifyName: "旅拍",
        clockid: [643, 866, 867, 868, 858, 857, 649, 647, 646, 645, 850, 851, 854, 855, 856, 626, 627, 628, 630, 629, 872, 871, 869, 870, 740, 691, 690, 689, 687, 686, 685]
      },
      {
        ClassifyId: 2,
        ClassifyNameEn: "Social",
        ClassifyName: "社交",
        clockid: [803, 512, 514, 614, 617, 618, 379, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 957, 470]
      },
      {
        ClassifyId: 10,
        ClassifyNameEn: "Financial",
        ClassifyName: "金融",
        clockid: [258, 259, 260, 264, 1181, 1217, 113, 56, 52, 53, 877, 269, 382, 78, 265, 267, 266, 117, 114, 115, 116, 1215, 1216]
      },
      {
        ClassifyId: 30,
        ClassifyNameEn: "Weather",
        ClassifyName: "天气",
        clockid: [523, 529, 532, 533, 537, 91, 92, 93, 95, 96, 101, 102]
      },
      {
        ClassifyId: 12,
        ClassifyNameEn: "Tools",
        ClassifyName: "工具",
        clockid: [1478, 1127, 1135, 794, 1153, 1154, 548, 1197, 620, 478, 448, 950, 948, 598, 962, 659]
      },
      {
        ClassifyId: 28,
        ClassifyNameEn: "Smart Hardware",
        ClassifyName: "智能硬件",
        clockid: [302, 303, 305, 415, 449, 456, 468]
      },
      {
        ClassifyId: 122,
        ClassifyNameEn: "AI-Styled Photo Frames",
        ClassifyName: "AI风格相框",
        clockid: [1109, 1472, 1125, 1126, 1426, 1427, 1428, 1429, 1430, 1431, 1473, 1474, 1475, 1476, 1124, 1123, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1477]
      }
    ],
    DeviceId: 300396998,
    PacketFlag: 1745214910
  });

  /** 设备同步后写入 public/template/classify-cache.json，优先于内置快照。 */
  let templateClassifyDataRuntime = null;

  function getTemplateClassifyData() {
    return templateClassifyDataRuntime || TEMPLATE_CLASSIFY_FALLBACK;
  }

  function setTemplateClassifyDataRuntime(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.ClassifyList)) return;
    templateClassifyDataRuntime = Object.freeze({
      ReturnCode: 0,
      ReturnMessage: "",
      ClassifyList: data.ClassifyList.map((row) => ({
        ClassifyId: toNum(row?.ClassifyId, 0),
        ClassifyName: String(row?.ClassifyName || "").trim(),
        ClassifyNameEn: String(row?.ClassifyNameEn || row?.ClassifyName || "").trim(),
        clockid: normalizeTemplateClassifyClockIds(row?.clockid)
      }))
    });
  }

  // 固件映射：disp -> slot offset（来源 src/middle/divoom_clock_manage.c 的 gdivoom_disp_image_item_table）
  const TEMPLATE_DISP_OFFSET_TABLE = Object.freeze({
    13: 42,
    18: 17,
    46: 0,
    47: 1,
    48: 2,
    55: 16,
    57: 3,
    58: 4,
    59: 11,
    60: 12,
    61: 13,
    62: 14,
    63: 15,
    64: 18,
    66: 22,
    67: 23,
    68: 24,
    69: 25,
    70: 26,
    71: 27,
    72: 28,
    73: 29,
    74: 32,
    78: 34,
    79: 35,
    81: 36,
    85: 37,
    89: 38,
    93: 39,
    98: 43,
    105: 44,
    107: 45,
    108: 46,
    124: 47,
    125: 52,
    126: 53,
    127: 54,
    128: 55,
    129: 56,
    130: 57,
    131: 6,
    132: 7,
    171: 48,
    172: 30,
    173: 49,
    174: 50,
    175: 51,
    182: 33,
    206: 58,
    207: 60,
    208: 61,
    209: 62,
    210: 63,
    211: 65,
    212: 66,
    217: 64,
    218: 59,
    233: 5,
    234: 82,
    240: 19,
    260: 21,
    281: 67,
    282: 68,
    283: 69,
    284: 70,
    285: 71,
    286: 72,
    287: 73,
    288: 74,
    289: 75,
    290: 76,
    297: 40,
    298: 41,
    310: 31,
    348: 77,
    349: 78,
    350: 79,
    352: 80,
    359: 81,
    364: 10,
    390: 8,
    391: 9,
    394: 85,
    395: 86,
    396: 87,
    403: 104,
    421: 105,
    423: 106,
    429: 88,
    430: 89,
    431: 90,
    432: 91,
    433: 92,
    434: 93,
    435: 94,
    436: 95,
    437: 96,
    438: 97,
    439: 98,
    440: 99,
    441: 100,
    442: 101,
    443: 102,
    444: 103,
    445: 20,
    446: 83,
    447: 84,
    454: 108,
    455: 107,
    456: 109,
    459: 110,
    461: 111,
    462: 112,
    463: 113,
    464: 114,
    470: 116,
    471: 115,
    472: 117,
    473: 118,
    475: 119,
    480: 124,
    481: 120,
    482: 122,
    483: 123,
    484: 121,
    492: 125
  });

  const LOCAL_ASSET_DISP_RULES = new Map([
    [13, { mode: "any" }],
    [18, { mode: "any" }],
    [46, { mode: "any" }],
    [47, { mode: "any" }],
    [48, { mode: "any" }],
    [55, { mode: "multiple", value: 10 }],
    [57, { mode: "multiple", value: 12 }],
    [58, { mode: "multiple", value: 12 }],
    [59, { mode: "multiple", value: 10 }],
    [60, { mode: "multiple", value: 10 }],
    [61, { mode: "multiple", value: 10 }],
    [62, { mode: "multiple", value: 10 }],
    [63, { mode: "multiple", value: 10 }],
    [64, { mode: "multiple", value: 10 }],
    [66, { mode: "multiple", value: 7 }],
    [67, { mode: "any" }],
    [68, { mode: "exact", value: 60 }],
    [69, { mode: "multiple", value: 10 }],
    [70, { mode: "multiple", value: 10 }],
    [71, { mode: "multiple", value: 10 }],
    [72, { mode: "multiple", value: 10 }],
    [73, { mode: "multiple", value: 2 }],
    [74, { mode: "multiple", value: 4 }],
    [78, { mode: "any" }],
    [79, { mode: "multiple", value: 12 }],
    [81, { mode: "any" }],
    [85, { mode: "any" }],
    [89, { mode: "any" }],
    [93, { mode: "any" }],
    [98, { mode: "any" }],
    [105, { mode: "multiple", value: 2 }],
    [107, { mode: "any" }],
    [108, { mode: "any" }],
    [124, { mode: "multiple", value: 10 }],
    [125, { mode: "any" }],
    [126, { mode: "any" }],
    [127, { mode: "any" }],
    [128, { mode: "any" }],
    [129, { mode: "any" }],
    [130, { mode: "any" }],
    [131, { mode: "pointer", value: 1 }],
    [132, { mode: "pointer", value: 1 }],
    [171, { mode: "any" }],
    [172, { mode: "multiple", value: 2 }],
    [173, { mode: "any" }],
    [174, { mode: "any" }],
    [175, { mode: "any" }],
    [182, { mode: "multiple", value: 2 }],
    [206, { mode: "multiple", value: 2 }],
    [207, { mode: "multiple", value: 30 }],
    [208, { mode: "any" }],
    [209, { mode: "multiple", value: 30 }],
    [210, { mode: "multiple", value: 30 }],
    [211, { mode: "any" }],
    [212, { mode: "any" }],
    [217, { mode: "any" }],
    [218, { mode: "multiple", value: 2 }],
    [233, { mode: "pointer", value: 1 }],
    [234, { mode: "any" }],
    [240, { mode: "multiple", value: 20 }],
    [260, { mode: "exact", value: 10 }],
    [281, { mode: "multiple", value: 10 }],
    [282, { mode: "multiple", value: 10 }],
    [283, { mode: "multiple", value: 10 }],
    [284, { mode: "multiple", value: 10 }],
    [285, { mode: "multiple", value: 10 }],
    [286, { mode: "multiple", value: 10 }],
    [287, { mode: "multiple", value: 10 }],
    [288, { mode: "multiple", value: 10 }],
    [289, { mode: "multiple", value: 10 }],
    [290, { mode: "multiple", value: 10 }],
    [297, { mode: "multiple", value: 10 }],
    [298, { mode: "multiple", value: 10 }],
    [310, { mode: "multiple", value: 2 }],
    [348, { mode: "any" }],
    [349, { mode: "any" }],
    [350, { mode: "any" }],
    [352, { mode: "any" }],
    [359, { mode: "any" }],
    [364, { mode: "any" }],
    [390, { mode: "pointer", value: 1 }],
    [391, { mode: "pointer", value: 1 }],
    [394, { mode: "any" }],
    [395, { mode: "any" }],
    [396, { mode: "any" }],
    [403, { mode: "any" }],
    [421, { mode: "any" }],
    [423, { mode: "any" }],
    [429, { mode: "any" }],
    [430, { mode: "any" }],
    [431, { mode: "any" }],
    [432, { mode: "any" }],
    [433, { mode: "any" }],
    [434, { mode: "any" }],
    [435, { mode: "any" }],
    [436, { mode: "any" }],
    [437, { mode: "any" }],
    [438, { mode: "any" }],
    [439, { mode: "any" }],
    [440, { mode: "any" }],
    [441, { mode: "any" }],
    [442, { mode: "any" }],
    [443, { mode: "any" }],
    [444, { mode: "any" }],
    [445, { mode: "any" }],
    [446, { mode: "any" }],
    [447, { mode: "any" }],
    [454, { mode: "multiple", value: 7 }],
    [455, { mode: "any" }],
    [456, { mode: "multiple", value: 12 }],
    [459, { mode: "any" }],
    [461, { mode: "any" }],
    [462, { mode: "multiple", value: 7 }],
    [463, { mode: "multiple", value: 7 }],
    [464, { mode: "multiple", value: 7 }],
    [470, { mode: "any" }],
    [471, { mode: "any" }],
    [472, { mode: "any" }],
    [473, { mode: "any" }],
    [475, { mode: "exact", value: 18 }],
    [480, { mode: "multiple", value: 10 }],
    [481, { mode: "multiple", value: 10 }],
    [482, { mode: "multiple", value: 10 }],
    [483, { mode: "multiple", value: 10 }],
    [484, { mode: "multiple", value: 10 }],
    [492, { mode: "multiple", value: 10 }]
  ]);

  const DEFAULT_ITEM = Object.freeze({
    size: 64,
    disp: 4,
    font: 0,
    info: "",
    color_1: "#ffffff",
    color_2: "#000000",
    image_id: 0,
    image_addr: "",
    sep: 0,
    x: 100,
    y: 500,
    w: 600,
    h: 120,
    alig: 3,
    angle: 0,
    hier: 0,
    transp: 100,
    animation: 0
  });

  function byId(id) {
    return document.getElementById(id);
  }

  function toNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ensureColorHex(value, fallback = "#ffffff") {
    if (typeof value !== "string") return fallback;
    const v = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      return "#" + v.slice(1).split("").map((c) => c + c).join("");
    }
    return fallback;
  }

  function colorToRgba(hex, alpha = 1) {
    const c = ensureColorHex(hex, "#ffffff");
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
  }

  function normalizeCharSpacing(value, fallback = 0) {
    return clamp(Math.round(toNum(value, fallback)), -20, 200);
  }

  /** 解析 Item 的字体 ID：支持数字 ID、数字字符串，或 font_info.cfg 中的 name。 */
  function resolveItemFontId(item) {
    const lookup = buildFontLookup(fontStore.getAllMetas());
    const resolved = resolveItemFontFields(item, lookup);
    if (resolved > 0) return resolved;
    const label = unresolvedFontLabel(item);
    if (label) {
      fontStore.log(`未识别字体名称「${label}」，请在 font_info.cfg 中确认或点击「更新字体」同步。`);
    }
    return toNum(item.font ?? item.Font ?? item.font_id ?? item.FontId, 0);
  }

  function measureTextWithSpacing(ctx, text, spacingPx = 0) {
    const chars = [...String(text ?? "")];
    if (!chars.length) return 0;
    let width = 0;
    for (const ch of chars) width += ctx.measureText(ch).width;
    if (chars.length > 1) width += spacingPx * (chars.length - 1);
    return width;
  }

  function drawTextWithSpacing(ctx, text, startX, y, spacingPx = 0) {
    const chars = [...String(text ?? "")];
    let x = startX;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      ctx.fillText(ch, x, y);
      const w = ctx.measureText(ch).width;
      if (i < chars.length - 1) x += w + spacingPx;
      else x += w;
    }
    return x - startX;
  }

  function basename(pathLike) {
    if (!pathLike || typeof pathLike !== "string") return "";
    const p = pathLike.replace(/\\/g, "/");
    const idx = p.lastIndexOf("/");
    return idx >= 0 ? p.slice(idx + 1) : p;
  }

  function stripExt(name) {
    if (!name) return "";
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDate(now) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function formatBytes(bytes) {
    const n = Math.max(0, toNum(bytes, 0));
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function getLocalAssetRule(disp) {
    return LOCAL_ASSET_DISP_RULES.get(toNum(disp, 0)) || null;
  }

  function isLocalAssetDisp(disp) {
    return !!getLocalAssetRule(disp);
  }

  function getRuleText(rule) {
    if (!rule) return "";
    if (rule.mode === "any") return t("editor.asset.ruleAny");
    if (rule.mode === "multiple") return t("editor.asset.ruleMultiple", { n: rule.value });
    if (rule.mode === "exact") return t("editor.asset.ruleExact", { n: rule.value });
    if (rule.mode === "pointer") return t("editor.asset.rulePointer");
    return "";
  }

  function getRuleExpectText(rule) {
    if (!rule) return "-";
    if (rule.mode === "any") return "any";
    if (rule.mode === "multiple") return `${rule.value}n`;
    if (rule.mode === "exact") return String(rule.value);
    if (rule.mode === "pointer") return "1";
    return "-";
  }

  /**
   * 由 MIME 推断栅格资源类别（与文件名后缀无关）。
   * `localPick: true` 时仅限用户本机选用的 JPG / WEBP / GIF（与设备常用下发格式一致）。
   */
  function inferRasterFormatFromMime(mimeType, opts = {}) {
    const localPick = opts.localPick === true;
    const m = String(mimeType || "").split(";")[0].trim().toLowerCase();
    if (m === "image/gif") return "gif";
    if (m === "image/webp") return "webp";
    if (m === "image/jpeg" || m === "image/jpg") return "jpeg";
    if (!localPick && m === "image/png") return "png";
    return "";
  }

  function readAscii(bytes, start, len) {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i] || 0);
    return s;
  }

  function parseGifFrameCount(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes.length < 14) return null;
    const sig = readAscii(bytes, 0, 6);
    if (sig !== "GIF87a" && sig !== "GIF89a") return null;
    let pos = 13;
    const packed = bytes[10] || 0;
    if (packed & 0x80) {
      const tableSize = 3 * (1 << ((packed & 0x07) + 1));
      pos += tableSize;
    }
    let frameCount = 0;
    while (pos < bytes.length) {
      const blockId = bytes[pos++];
      if (blockId === 0x3B) break;
      if (blockId === 0x2C) {
        if (pos + 9 > bytes.length) break;
        const localPacked = bytes[pos + 8] || 0;
        pos += 9;
        if (localPacked & 0x80) {
          const localSize = 3 * (1 << ((localPacked & 0x07) + 1));
          pos += localSize;
        }
        if (pos >= bytes.length) break;
        pos += 1; // LZW min code size
        while (pos < bytes.length) {
          const size = bytes[pos++];
          if (size === 0) break;
          pos += size;
        }
        frameCount += 1;
        continue;
      }
      if (blockId === 0x21) {
        if (pos >= bytes.length) break;
        pos += 1; // extension label
        while (pos < bytes.length) {
          const size = bytes[pos++];
          if (size === 0) break;
          pos += size;
        }
        continue;
      }
      break;
    }
    if (!Number.isFinite(frameCount) || frameCount <= 0) return 1;
    return frameCount;
  }

  function parseWebpFrameCount(buf) {
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    if (bytes.length < 16) return null;
    if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") return null;
    let pos = 12;
    let anmfCount = 0;
    while (pos + 8 <= bytes.length) {
      const chunkTag = readAscii(bytes, pos, 4);
      const chunkSize = view.getUint32(pos + 4, true);
      if (chunkTag === "ANMF") anmfCount += 1;
      pos += 8 + chunkSize + (chunkSize % 2);
      if (chunkSize < 0) break;
    }
    return anmfCount > 0 ? anmfCount : 1;
  }

  function inferImageMimeFromBuffer(buf, fileName = "", mimeHint = "") {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
    const sig6 = bytes.length >= 6 ? readAscii(bytes, 0, 6) : "";
    if (sig6 === "GIF87a" || sig6 === "GIF89a") return "image/gif";
    if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") return "image/webp";
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";

    const mime = String(mimeHint || "").split(";")[0].trim().toLowerCase();
    if (mime.startsWith("image/")) return mime;

    return "application/octet-stream";
  }

  function loadImageByObjectUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
  }

  /** @returns {boolean} true 表示超过上限并已弹出提示（调用方应清空 input 并中止加载）。 */
  function alertIfLocalPickFileTooLarge(file) {
    const size = toNum(file?.size, 0);
    if (size <= LOCAL_FILE_PICK_MAX_BYTES) return false;
    alert(t("alert.localFileTooLarge"));
    return true;
  }

  async function loadLocalAssetFromFile(file) {
    const buf = await file.arrayBuffer();
    const mimeType = inferImageMimeFromBuffer(buf, file?.name || "", file?.type || "");
    const fmt = inferRasterFormatFromMime(mimeType, { localPick: true });
    if (!fmt) throw new Error(t("editor.asset.formatError"));
    const normalizedMime = mimeType.startsWith("image/")
      ? mimeType
      : `image/${fmt === "jpeg" ? "jpeg" : fmt}`;
    let frameCount = null;
    try {
      if (fmt === "gif") frameCount = parseGifFrameCount(buf);
      else if (fmt === "webp") frameCount = parseWebpFrameCount(buf);
      else if (fmt === "jpeg") frameCount = 1;
    } catch (e) {
      frameCount = null;
    }
    const objectUrl = URL.createObjectURL(new Blob([buf], { type: normalizedMime }));
    try {
      const image = await loadImageByObjectUrl(objectUrl);
      const decodedFrames = await tryDecodeAnimationFrames(buf, normalizedMime);
      const finalFrameCount = Number.isFinite(frameCount)
        ? frameCount
        : (decodedFrames.length
          ? decodedFrames.length
          : fmt === "gif" || fmt === "webp"
            ? null
            : 1);
      return {
        name: String(file.name || ""),
        fromLocalPick: true,
        sourceUrl: "",
        size: toNum(file.size, 0),
        mimeType: normalizedMime,
        format: fmt,
        frameCount: finalFrameCount,
        frames: decodedFrames,
        objectUrl,
        image
      };
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      throw e;
    }
  }

  function releaseStandaloneAsset(asset) {
    if (!asset) return;
    if (Array.isArray(asset.frames)) {
      for (const frame of asset.frames) {
        if (frame && typeof frame.close === "function") {
          try {
            frame.close();
          } catch (e) {
            // ignore
          }
        }
      }
    }
    if (asset.objectUrl) {
      try {
        URL.revokeObjectURL(asset.objectUrl);
      } catch (e) {
        // ignore
      }
    }
  }

  async function loadLocalAssetFromUrl(url, displayName = "") {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mimeHint = String(res.headers.get("content-type") || "");
    const buf = await res.arrayBuffer();
    const parsedName = displayName || (() => {
      try {
        const u = new URL(url, window.location.href);
        return basename(u.pathname || "");
      } catch (e) {
        return basename(url);
      }
    })();
    const mimeType = inferImageMimeFromBuffer(buf, parsedName, mimeHint);
    const format = inferRasterFormatFromMime(mimeType, { localPick: false });
    const blob = mimeType === "application/octet-stream"
      ? new Blob([buf])
      : new Blob([buf], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadImageByObjectUrl(objectUrl);
      let frameCount = null;
      if (format === "gif") frameCount = parseGifFrameCount(buf);
      else if (format === "webp") frameCount = parseWebpFrameCount(buf);
      else if (format === "jpeg" || format === "png") frameCount = 1;
      const decodedFrames = await tryDecodeAnimationFrames(buf, mimeType);
      const finalFrameCount = Number.isFinite(frameCount)
        ? frameCount
        : (decodedFrames.length ? decodedFrames.length : 1);
      return {
        name: parsedName || basename(url),
        fromLocalPick: false,
        sourceUrl: absoluteUrlFromResolvedPath(url),
        size: toNum(buf.byteLength, 0),
        mimeType,
        format,
        frameCount: finalFrameCount,
        frames: decodedFrames,
        objectUrl,
        image
      };
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      throw e;
    }
  }

  async function loadFirstTemplateAsset(baseDir, baseName, extCandidates) {
    const base = ensureSlash(baseDir);
    const tried = [];
    for (const ext of extCandidates) {
      const rel = `${base}${baseName}${ext}`;
      tried.push(rel);
      try {
        const asset = await loadLocalAssetFromUrl(rel, `${baseName}${ext}`);
        return { asset, path: rel, tried };
      } catch (e) {
        // try next extension
      }
    }
    return { asset: null, path: "", tried };
  }

  function validateLocalAssetRule(rule, frameCount) {
    if (!rule) return { level: "ok", text: t("editor.asset.validationAny") };
    if (rule.mode === "any") return { level: "ok", text: t("editor.asset.validationAny") };
    if (!Number.isFinite(frameCount) || frameCount <= 0) {
      return { level: "warn", text: t("editor.asset.validationUnknown") };
    }
    const frames = toNum(frameCount, 0);
    if (rule.mode === "pointer") {
      if (frames === 1) return { level: "ok", text: t("editor.asset.validationPass") };
      return {
        level: "bad",
        text: t("editor.asset.validationFail", { rule: getRuleExpectText(rule), actual: frames })
      };
    }
    if (rule.mode === "exact") {
      if (frames === toNum(rule.value, 0)) return { level: "ok", text: t("editor.asset.validationPass") };
      return {
        level: "bad",
        text: t("editor.asset.validationFail", { rule: getRuleExpectText(rule), actual: frames })
      };
    }
    if (rule.mode === "multiple") {
      const base = Math.max(1, toNum(rule.value, 1));
      if (frames % base === 0) return { level: "ok", text: t("editor.asset.validationPass") };
      return {
        level: "bad",
        text: t("editor.asset.validationFail", { rule: getRuleExpectText(rule), actual: frames })
      };
    }
    return { level: "warn", text: t("editor.asset.validationUnknown") };
  }

  async function tryDecodeAnimationFrames(buf, mimeType) {
    if (typeof ImageDecoder === "undefined") return [];
    const type = String(mimeType || "").toLowerCase();
    if (!type.includes("gif") && !type.includes("webp")) return [];
    let decoder = null;
    try {
      decoder = new ImageDecoder({ data: buf, type: mimeType });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      const frameCount = Math.max(1, toNum(track?.frameCount, 1));
      if (frameCount <= 1 || frameCount > 240) return [];
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        const result = await decoder.decode({ frameIndex: i });
        if (result?.image) frames.push(result.image);
      }
      return frames;
    } catch (e) {
      return [];
    } finally {
      if (decoder) {
        try {
          decoder.close();
        } catch (e) {
          // ignore
        }
      }
    }
  }

  function getDispFrameSlot(disp, now = new Date()) {
    const mon = now.getMonth() + 1;
    const day = now.getDate();
    switch (toNum(disp, 0)) {
      case 55:
      case 63:
      case 64:
      case 124:
      case 260:
        return Math.floor(now.getSeconds() / 6) % 10;
      case 57:
        return now.getHours() % 12;
      case 58:
        return Math.floor(now.getMinutes() / 5) % 12;
      case 59:
        return Math.floor(now.getHours() / 10);
      case 60:
        return now.getHours() % 10;
      case 61:
        return Math.floor(now.getMinutes() / 10);
      case 62:
        return now.getMinutes() % 10;
      case 66:
        return now.getDay();
      case 68:
        return now.getSeconds();
      case 69:
        return Math.floor(mon / 10);
      case 70:
        return mon % 10;
      case 71:
        return Math.floor(day / 10);
      case 72:
        return day % 10;
      case 73:
        return now.getHours() >= 12 ? 1 : 0;
      case 79:
        return now.getMonth();
      case 105:
      case 206:
      case 218:
        return now.getHours() >= 6 && now.getHours() < 18 ? 0 : 1;
      case 182:
        return now.getSeconds() % 2;
      case 172:
        return now.getSeconds() % 2;
      case 207:
      case 209:
      case 210:
        return (day - 1) % 30;
      case 240:
        return now.getSeconds() % 20;
      case 74:
        return 3;
      case 281:
      case 59:
        return Math.floor(now.getHours() / 10);
      case 282:
      case 60:
        return now.getHours() % 10;
      case 283:
      case 61:
        return Math.floor(now.getMinutes() / 10);
      case 284:
      case 62:
        return now.getMinutes() % 10;
      case 297:
      case 298:
      case 480:
      case 481:
      case 482:
      case 483:
      case 484:
        return Math.floor(now.getSeconds() / 6) % 10;
      case 310:
        return 0;
      case 454:
      case 462:
      case 463:
      case 464:
        return 3;
      case 456:
        return now.getHours() % 12;
      case 475:
        return Math.min(17, Math.floor(now.getDate() % 18));
      case 492:
        return 8;
      default:
        return -1;
    }
  }

  function resolveFrameIndexForDisp(disp, frameCount, now = new Date()) {
    const rule = getLocalAssetRule(disp);
    if (!rule || !Number.isFinite(frameCount) || frameCount <= 1) return 0;
    const total = Math.max(1, Math.floor(frameCount));
    const slot = getDispFrameSlot(disp, now);
    if (slot < 0) return Math.floor((Date.now() / 120) % total);

    if (rule.mode === "exact") {
      return clamp(slot, 0, total - 1);
    }
    if (rule.mode === "multiple") {
      const base = Math.max(1, toNum(rule.value, 1));
      const slotNorm = ((slot % base) + base) % base;
      const step = total / base;
      const idx = Math.floor(slotNorm * step);
      return clamp(idx, 0, total - 1);
    }
    if (rule.mode === "pointer") {
      return 0;
    }
    return Math.floor((Date.now() / 120) % total);
  }

  function downloadTextFile(fileName, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readFileAsJson(file) {
    const txt = await file.text();
    return parseJsonText(txt);
  }

  function parseJsonText(txt) {
    const cleaned = String(txt ?? "").replace(/^\uFEFF/, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // 兼容部分环境下只提供 `"FontList":[...]` 片段的情况
      if (!cleaned.startsWith("{") && /"FontList"\s*:/.test(cleaned)) {
        return JSON.parse(`{${cleaned}}`);
      }
      throw e;
    }
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) throw new Error("unexpected HTML (SPA fallback?)");
    const txt = await res.text();
    return parseJsonText(txt);
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function loadJsonByIframe(path, timeoutMs = 4500) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.referrerPolicy = "no-referrer";
      let done = false;
      const finish = (ok, payload) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        iframe.remove();
        if (ok) resolve(payload);
        else reject(payload instanceof Error ? payload : new Error(String(payload)));
      };

      const timer = setTimeout(() => {
        finish(false, new Error("iframe load timeout"));
      }, timeoutMs);

      iframe.onload = () => {
        try {
          const doc = iframe.contentDocument;
          const text = doc?.body?.textContent || doc?.documentElement?.textContent || "";
          if (!text.trim()) {
            finish(false, new Error("iframe empty"));
            return;
          }
          finish(true, parseJsonText(text));
        } catch (e) {
          finish(false, e);
        }
      };

      iframe.onerror = () => {
        finish(false, new Error("iframe load error"));
      };

      document.body.appendChild(iframe);
      iframe.src = path;
    });
  }

  async function loadFirstJson(paths) {
    for (const p of paths) {
      try {
        return await fetchJson(p);
      } catch (e) {
        // try next strategy
      }
    }
    for (const p of paths) {
      try {
        return await loadJsonByIframe(p);
      } catch (e) {
        // continue
      }
    }
    return null;
  }

  function errorToText(err) {
    if (!err) return "unknown error";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message || String(err);
    try {
      return JSON.stringify(err);
    } catch (e) {
      return String(err);
    }
  }

  function ensureSlash(pathLike) {
    const p = String(pathLike || "");
    if (!p) return "";
    return p.endsWith("/") ? p : `${p}/`;
  }

  function absoluteUrlFromResolvedPath(resolvedPath) {
    const s = String(resolvedPath || "").trim();
    if (!s) return "";
    try {
      return new URL(s, window.location.href).href;
    } catch (e) {
      return s;
    }
  }

  function refreshBackgroundSourceLabel() {
    syncTemplateDomRefs();
    if (!dom.txtBgSourcePath) return;
    dom.txtBgSourcePath.value = state.backgroundSourceLabel || "";
    dom.txtBgSourcePath.title = state.backgroundSourceLabel || "";
  }

  function refreshAppPreviewSourceLabel() {
    syncTemplateDomRefs();
    if (!dom.txtAppPreviewSourcePath) return;
    dom.txtAppPreviewSourcePath.value = state.appPreviewSourceLabel || "";
    dom.txtAppPreviewSourcePath.title = state.appPreviewSourceLabel || "";
  }

  function refreshWatchDescFields() {
    if (!state.config || typeof state.config !== "object") return;
    if (dom.txtDescCn) dom.txtDescCn.value = String(state.config.DescCn ?? "");
    if (dom.txtDescEn) dom.txtDescEn.value = String(state.config.DescEn ?? "");
  }

  function fontBaseFromCfgPath(cfgPath) {
    const raw = String(cfgPath || "");
    if (!raw) return "";
    const marker = "font_info.cfg";
    const idx = raw.toLowerCase().lastIndexOf(marker);
    if (idx < 0) return "";
    return ensureSlash(raw.slice(0, idx));
  }

  async function loadFirstJsonWithTrace(paths, onTrace) {
    const trace = typeof onTrace === "function" ? onTrace : () => {};
    for (const p of paths) {
      try {
        const data = await fetchJson(p);
        trace(`fetch 成功: ${p}`);
        return { data, path: p, via: "fetch" };
      } catch (e) {
        trace(`fetch 失败: ${p} -> ${errorToText(e)}`);
      }
    }
    for (const p of paths) {
      try {
        const data = await loadJsonByIframe(p);
        trace(`iframe 成功: ${p}`);
        return { data, path: p, via: "iframe" };
      } catch (e) {
        trace(`iframe 失败: ${p} -> ${errorToText(e)}`);
      }
    }
    return { data: null, path: "", via: "" };
  }

  /** 将 `alig` 转为 canvas `textAlign` 语义；设备值为 `3/4/5`，兼容旧编辑器 `1/2/3`。 */
  function guessAlign(value) {
    const v = toNum(value, 0);
    if (v === 4 || v === 1 || v === 0) return "left";
    if (v === 5 || v === 2) return "right";
    if (v === 3) return "center";
    return "left";
  }

  /**
   * 设备 AlignType：`3` 居中，`4` 左对齐，`5` 右对齐。
   * 旧版编辑器使用 `1` 左、`2` 右、`3` 中 —— 加载时升级为 `4/5/3`。
   */
  function normalizeAligToDevice(v) {
    const n = toNum(v, NaN);
    if (!Number.isFinite(n)) return DEFAULT_ITEM.alig;
    if (n === 3 || n === 4 || n === 5) return n;
    if (n === 1 || n === 0) return 4;
    if (n === 2) return 5;
    return DEFAULT_ITEM.alig;
  }

  function dispName(disp) {
    return DISP_NAME_MAP[disp] || `DISP_${disp}`;
  }

  const ZH_COMMENT_EN_REPLACERS = [
    ["整点报时", "hourly chime"],
    ["潮汐曲线", "tidal curve"],
    ["恋爱天数", "days in love"],
    ["星座", "zodiac"],
    ["单元项", "item"],
    ["标题", "title"],
    ["数据轮播", "data carousel"],
    ["最高气温", "max temperature"],
    ["最低气温", "min temperature"],
    ["白天黑夜模式", "day/night mode"],
    ["全字母", "full letters"],
    ["三个字母缩写", "three-letter abbreviation"],
    ["两字母", "two letters"],
    ["小时制", "hour mode"],
    ["上下午", "AM/PM"],
    ["分钟", "minute"],
    ["小时", "hour"],
    ["秒钟", "second"],
    ["十位", "tens digit"],
    ["个位", "units digit"],
    ["高位", "high digit"],
    ["低位", "low digit"],
    ["仅取", "uses only"],
    ["时间", "time "],
    ["秒", "second"],
    ["数字", "number"],
    ["中文", "Chinese"],
    ["英文", "English"],
    ["天气", "weather"],
    ["图像", "image"],
    ["图片", "image"],
    ["图", "icon"],
    ["指针", "pointer"],
    ["网络图库", "online gallery"],
    ["网络", "network"],
    ["用户", "user"],
    ["显示", "display"],
    ["月相", "moon phase"],
    ["星期", "week"],
    ["月", "month"],
    ["日", "day"],
    ["年", "year"],
    ["农历", "lunar"],
    ["最高气温", "max temperature"],
    ["最低气温", "min temperature"],
    ["温度", "temperature"],
    ["闹钟", "alarm"],
    ["日历", "calendar"],
    ["歌曲", "song"],
    ["歌名", "song title"],
    ["歌词", "lyrics"],
    ["白天黑夜模式", "day/night mode"],
    ["倒计时", "countdown"],
    ["相册", "album"],
    ["子表盘组件开始ID", "sub-dial component start ID"],
    ["子表盘组件结束ID", "sub-dial component end ID"],
    ["子表盘", "sub-dial"],
    ["组件", "component"],
    ["开始", "start"],
    ["结束", "end"],
    ["表盘", "watchface"],
    ["噪音", "noise"],
    ["风速", "wind speed"],
    ["可见度", "visibility"],
    ["湿度", "humidity"],
    ["英文字母", "english letters"],
    ["大后天", "in three days"],
    ["后后天", "in four days"],
    ["后天", "tomorrow+1"],
    ["明天", "tomorrow"],
    ["当天", "today"],
    ["今天", "today"],
    ["本地", "local"],
    ["二维码", "QR code"],
    ["号", "date"],
    ["月份", "month"],
    ["星期", "week"],
    ["日期", "date"],
    ["农历", "lunar"],
    ["显示", "display"],
    ["主题", "theme"],
    ["提醒框", "reminder box"],
    ["倒计时", "countdown"],
    ["间隔", "interval"],
    ["强度", "strength"],
    ["头像", "avatar"],
    ["用户", "user"],
    ["网络", "network"],
    ["世界", "world"],
    ["城市", "city"],
    ["可见度", "visibility"],
    ["湿度", "humidity"],
    ["风速", "wind speed"],
    ["闹钟", "alarm"],
    ["日出", "sunrise"],
    ["日落", "sunset"],
    ["月相", "moon phase"],
    ["名称", "name"],
    ["歌名", "song title"],
    ["歌词", "lyrics"],
    ["动画", "animation"],
    ["相册", "album"],
    ["适配底图", "fits background"],
    ["不适配底图", "not fit background"],
    ["边框表盘中的像素艺术位置", "pixel art position in framed watchface"],
    ["年", "year"],
    ["月", "month"],
    ["日", "day"],
    ["分", "minute"],
    ["制", "mode"]
  ];

  function translateZhCommentToEnglish(zhComment, id) {
    let out = String(zhComment || "");
    out = out
      .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 65248))
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/，/g, ",")
      .replace(/：/g, ":");
    for (const [from, to] of ZH_COMMENT_EN_REPLACERS) {
      out = out.split(from).join(to);
    }
    out = out
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .replace(/[，。；、【】《》“”‘’]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*([,:;()\-])\s*/g, "$1 ")
      .trim();
    if (!out) return `Element ${id}`;
    return out.replace(/^./, (c) => c.toUpperCase());
  }

  function dispComment(disp) {
    const id = toNum(disp, NaN);
    if (!Number.isFinite(id)) return "";
    const fromCatalog = dispCatalogStore.getDisplayName(id);
    if (fromCatalog) return fromCatalog;
    const zhText = String(DISP_COMMENT_ZH_MAP[id] || "").trim();
    const locale = String(getLocaleCode() || "").toLowerCase();
    if (locale.startsWith("zh")) {
      return zhText || `显示元素 ${id}`;
    }
    if (!zhText) return `Element ${id}`;
    return translateZhCommentToEnglish(zhText, id);
  }

  function formatDispOptionText(disp) {
    const id = toNum(disp, 0);
    return `${id} | ${dispComment(id)}`;
  }

  const DISP_CATEGORY_ORDER = [
    "disp.cat.timeDate",
    "disp.cat.weather",
    "disp.cat.lunar",
    "disp.cat.audio",
    "disp.cat.appNet",
    "disp.cat.image",
    "disp.cat.pointerComponent",
    "disp.cat.text",
    "disp.cat.other"
  ];

  function dispCategoryKey(disp, name) {
    const upper = String(name || "").toUpperCase();
    if (disp >= 261 && disp <= 279) return "disp.cat.pointerComponent";
    if (POINTER_DISP_IDS.has(disp) || /POINT|DIAL|COMPONENT|CALENDAR_WATCH/.test(upper)) return "disp.cat.pointerComponent";
    if (/CHINA_|JIEQI|CONST|GOOD|BAD|LUNAR/.test(upper)) return "disp.cat.lunar";
    // DIVOOM_CLOCK_DISP_SUPPORT_TEMP_PIC：摄氏/华氏双图资源，归为图像类而非天气文本
    if (disp === 172) return "disp.cat.image";
    if (/WEATHER|TEMP|WIND|VISIBILITY|HUMI|DAY_NIGHT|SUNRISE|SUNSET|TIDAL|PHASE_MOON/.test(upper)) return "disp.cat.weather";
    if (/MUSIC|SPOTIFY|EQ|ALARM|NOISE/.test(upper)) return "disp.cat.audio";
    if (/APP_ITEM|APP_NET|APP_CON|APP_PIC|APP_TITLE|NET\d+_|NET_PIC|NET_TEXT|USER_TEXT|CALENDAR_EVENT|QR_CODE/.test(upper)) {
      return "disp.cat.appNet";
    }
    if (IMAGE_DISP_IDS.has(disp) || /IMAGE|GIF|PIC|PHOTO|ALBUM|HEAD_IMG/.test(upper)) return "disp.cat.image";
    if (/TEXT|WORD|NEWS|TITLE|COUNT_DOWN|DAYS_OF_LOVE/.test(upper)) return "disp.cat.text";
    if (/HOUR|MIN|SECOND|WEEK|YEAR|MON|DAY|DATE|TIME|AM_PM/.test(upper)) return "disp.cat.timeDate";
    return "disp.cat.other";
  }

  class FontStore {
    constructor(onStatus, onChanged) {
      this.onStatus = onStatus;
      this.onChanged = onChanged;
      this.fontMeta = new Map();
      this.fontFilesByName = new Map();
      this.fontFileById = new Map();
      this.ttfFamilies = new Map();
      this.imageBuffers = new Map();
      this.imageGlyphCache = new Map();
      this.imageGlyphPending = new Map();
      this.fetchAttempted = new Set();
      this.logs = [];
    }

    log(msg) {
      const t = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.logs.push(t);
      if (this.logs.length > 90) this.logs.shift();
      if (this.onStatus) this.onStatus(this.logs.join("\n"));
    }

    getMeta(id) {
      const n = toNum(id, NaN);
      if (!Number.isFinite(n)) return null;
      return this.fontMeta.get(n) || this.fontMeta.get(String(n)) || null;
    }

    getAllMetas() {
      return [...this.fontMeta.values()].sort((a, b) => a.id - b.id);
    }

    getFamily(id) {
      this.ensureOnDemandFetch(id);
      return this.ttfFamilies.get(id) || "";
    }

    parseFontListLike(raw) {
      const list = Array.isArray(raw?.font_list)
        ? raw.font_list
        : Array.isArray(raw?.FontList)
          ? raw.FontList
          : Array.isArray(raw)
            ? raw
            : [];
      if (!list.length) return 0;

      let count = 0;
      for (const item of list) {
        const id = toNum(item.id ?? item.ID, NaN);
        if (!Number.isFinite(id)) continue;
        const prev = this.fontMeta.get(id) || { id };
        const merged = {
          id,
          type: toNum(item.type ?? item.Type, prev.type ?? 1),
          url: String(item.url ?? item.Url ?? prev.url ?? ""),
          charset: String(item.charset ?? item.charSet ?? item.Charset ?? prev.charset ?? ""),
          name: String(item.name ?? item.Name ?? item.NameEn ?? item.NameCn ?? prev.name ?? "")
        };
        this.fontMeta.set(id, merged);
        count++;
      }
      this.log(`已合并字体元数据 ${count} 条。`);
      this.bindFilesToMetas();
      this.onChanged?.();
      return count;
    }

    parseFontNamesLike(raw) {
      const list = Array.isArray(raw?.font_list) ? raw.font_list : [];
      if (!list.length) return 0;
      let c = 0;
      for (const row of list) {
        const id = toNum(row.id ?? row.ID, NaN);
        if (!Number.isFinite(id)) continue;
        const meta = this.fontMeta.get(id) || { id, type: 1, url: "", charset: "" };
        meta.name = String(row.name ?? row.Name ?? meta.name ?? "");
        this.fontMeta.set(id, meta);
        c++;
      }
      this.log(`已合并字体名称 ${c} 条。`);
      this.onChanged?.();
      return c;
    }

    putFile(file) {
      const lower = file.name.toLowerCase();
      this.fontFilesByName.set(lower, file);
      const base = stripExt(lower);
      const match = base.match(/(^|[_\-])(\d{1,5})(?=$|[_\-])/);
      if (match) {
        const fileNum = toNum(match[2], NaN);
        // 当前规则：文件名 = 字体ID + 1，例如 289.bin -> font id 288
        const mappedId = fileNum - 1;
        if (Number.isFinite(mappedId) && mappedId >= 0 && !this.fontFileById.has(mappedId)) {
          this.fontFileById.set(mappedId, file);
        }
      }
    }

    async addFiles(fileList) {
      const files = [...fileList];
      files.forEach((f) => this.putFile(f));
      this.log(`已读入文件 ${files.length} 个。`);
      await this.bindFilesToMetas();
      this.onChanged?.();
    }

    async bindFilesToMetas() {
      for (const meta of this.fontMeta.values()) {
        if (!this.fontFileById.has(meta.id)) {
          const fileId = toNum(meta.id, NaN) + 1;
          const candidates = Number.isFinite(fileId) && fileId >= 0
            ? [`${fileId}.bin`, `${fileId}.BIN`]
            : [];
          let found = null;
          for (const n of candidates) {
            if (!n) continue;
            found = this.fontFilesByName.get(n.toLowerCase());
            if (found) break;
          }
          if (found) this.fontFileById.set(meta.id, found);
        }

        if (this.fontFileById.has(meta.id)) {
          const file = this.fontFileById.get(meta.id);
          if (toNum(meta.type, 1) === 1) {
            await this.ensureTtfFamily(meta.id, file);
          } else {
            await this.ensureImageBuffer(meta.id, file);
          }
        }
      }
      this.onChanged?.();
    }

    async ensureTtfFamily(id, file) {
      if (this.ttfFamilies.has(id)) return this.ttfFamilies.get(id);
      try {
        const ab = await file.arrayBuffer();
        const family = `wf-font-${id}`;
        const face = new FontFace(family, ab);
        await face.load();
        document.fonts.add(face);
        this.ttfFamilies.set(id, family);
        this.log(`TTF 字体可用: id=${id}, file=${file.name}`);
        return family;
      } catch (e) {
        const reason = e && e.message ? e.message : String(e);
        this.log(`TTF 字体加载失败: id=${id}, file=${file.name}, reason=${reason}`);
        return "";
      }
    }

    async ensureImageBuffer(id, file) {
      if (this.imageBuffers.has(id)) return this.imageBuffers.get(id);
      try {
        const ab = await file.arrayBuffer();
        this.imageBuffers.set(id, ab);
        this.log(`图像字体缓冲已加载: id=${id}, file=${file.name}, size=${ab.byteLength}`);
        return ab;
      } catch (e) {
        this.log(`图像字体缓冲加载失败: id=${id}, file=${file.name}`);
        return null;
      }
    }

    ensureOnDemandFetch(id) {
      const fontId = toNum(id, NaN);
      if (!Number.isFinite(fontId)) return;
      if (this.fontFileById.has(fontId)) return;
      if (this.fetchAttempted.has(fontId)) return;
      const meta = this.getMeta(fontId);
      if (!meta) return;

      this.fetchAttempted.add(fontId);
      const candidates = [];
      const seen = new Set();
      const add = (name) => {
        if (!name) return;
        const n = String(name).trim();
        if (!n) return;
        const key = n.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(n);
      };
      const localFileId = fontId + 1;
      add(`${localFileId}.bin`);
      add(`${localFileId}.BIN`);
      if (!candidates.length) return;

      (async () => {
        const basePaths = Array.isArray(runtime.fontBasePaths) && runtime.fontBasePaths.length
          ? runtime.fontBasePaths
          : [withBase("font/")];
        for (const local of candidates) {
          for (const base of basePaths) {
            try {
              const url = `${ensureSlash(base)}${local}`;
              const res = await fetch(url, { cache: "no-store" });
              if (!res.ok) continue;
              const blob = await res.blob();
              const file = new File([blob], local, { type: blob.type || "application/octet-stream" });
              this.putFile(file);
              this.fontFileById.set(fontId, file);
              if (toNum(meta.type, 1) === 1) await this.ensureTtfFamily(fontId, file);
              else await this.ensureImageBuffer(fontId, file);
              this.log(`按需读取字体成功: id=${fontId}, file=${local}, base=${base}`);
              this.onChanged?.();
              return;
            } catch (e) {
              // keep trying other base paths
            }
          }
        }
        this.log(`按需读取字体失败: id=${fontId}（已按 ID+1.BIN 规则尝试）`);
      })();
    }

    isImageFont(id) {
      const n = toNum(id, NaN);
      if (!Number.isFinite(n)) return false;
      const meta = this.getMeta(n);
      if (meta) {
        if (toNum(meta.type, 1) === 0) return true;
        const url = String(meta.url || "").toLowerCase();
        // 设备 font_info 中图像资源多为 .bin；防止 type 字段异常时编辑区与画布不一致
        if (url.endsWith(".bin")) return true;
      }
      if (this.imageBuffers.has(n)) return true;
      return false;
    }

    async ensureGlyph(meta, char) {
      const key = `${meta.id}:${char}`;
      if (this.imageGlyphCache.has(key)) return this.imageGlyphCache.get(key);
      if (this.imageGlyphPending.has(key)) return null;
      const pending = (async () => {
        try {
          const buffer = this.imageBuffers.get(meta.id);
          if (!buffer) return null;
          if (!meta.charset) return null;
          const pos = meta.charset.indexOf(char);
          if (pos < 0) return null;

          const tableOff = 2 + pos * 4;
          if (tableOff + 4 > buffer.byteLength) return null;
          const dv = new DataView(buffer);
          const start = dv.getUint32(tableOff, true);
          let end = buffer.byteLength;
          if (pos < meta.charset.length - 1) {
            if (tableOff + 8 > buffer.byteLength) return null;
            end = dv.getUint32(tableOff + 4, true);
          }
          if (start >= end || end > buffer.byteLength) return null;

          const blob = new Blob([buffer.slice(start, end)], { type: "image/webp" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
          URL.revokeObjectURL(url);
          this.imageGlyphCache.set(key, img);
          return img;
        } catch (e) {
          return null;
        } finally {
          this.imageGlyphPending.delete(key);
        }
      })();
      this.imageGlyphPending.set(key, pending);
      return null;
    }

    drawImageFontText(ctx, text, item, rect, fontIdOverride) {
      const fontId = toNum(fontIdOverride != null ? fontIdOverride : item.font, 0);
      const meta = this.getMeta(fontId);
      if (!meta || !this.isImageFont(fontId)) return false;
      if (!meta.charset) return false;
      if (!this.imageBuffers.has(fontId)) {
        this.ensureOnDemandFetch(fontId);
        return false;
      }

      const chars = [...String(text ?? "")];
      if (!chars.length) return true;

      const spacingPx = normalizeCharSpacing(item.sep, 0);
      const glyphs = chars.map((ch) => {
        const g = this.imageGlyphCache.get(`${fontId}:${ch}`) || null;
        if (!g) this.ensureGlyph(meta, ch);
        return g;
      });
      let maxGlyphH = 0;
      let sumGlyphW = 0;
      let loadedGlyphCount = 0;
      for (const glyph of glyphs) {
        if (!glyph) continue;
        const glyphW = Math.max(1, glyph.width);
        const glyphH = Math.max(1, glyph.height);
        sumGlyphW += glyphW;
        maxGlyphH = Math.max(maxGlyphH, glyphH);
        loadedGlyphCount++;
      }
      const fallbackH = maxGlyphH > 0
        ? maxGlyphH
        : Math.max(10, Math.round(Math.max(12, rect.h * 0.8)));
      const estimatedW = loadedGlyphCount > 0
        ? Math.max(8, Math.round(sumGlyphW / loadedGlyphCount))
        : Math.max(8, Math.round(fallbackH * 0.62));
      let totalW = 0;
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        if (g) {
          totalW += Math.max(1, g.width);
        } else {
          totalW += estimatedW;
        }
        if (i < glyphs.length - 1) totalW += spacingPx;
      }

      let x = rect.x + 2;
      const align = guessAlign(item.alig ?? item.align);
      if (align === "center") x = rect.x + Math.max(0, (rect.w - totalW) / 2);
      if (align === "right") x = rect.x + Math.max(0, rect.w - totalW - 2);
      const lineH = Math.max(maxGlyphH, fallbackH);
      const lineTop = rect.y + (rect.h - lineH) / 2;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const img = glyphs[i];
        if (img) {
          const glyphW = Math.max(1, img.width);
          const glyphH = Math.max(1, img.height);
          const glyphY = lineTop + (lineH - glyphH) / 2;
          ctx.drawImage(img, x, glyphY, glyphW, glyphH);
          x += glyphW;
        } else {
          // Keep logical advance width while glyph is missing/not ready, no color fallback.
          x += estimatedW;
        }
        if (i < chars.length - 1) x += spacingPx;
      }
      return true;
    }
  }

  const dom = {
    selectLang: byId("select-lang"),
    appTitle: byId("app-title"),
    appSubtitle: byId("app-subtitle"),
    lblLang: byId("lbl-lang"),
    lblLanDevice: byId("lbl-lan-device"),
    selectLanDevice: byId("select-lan-device"),
    btnRefreshLanDevices: byId("btn-refresh-lan-devices"),
    btnLanCopyDebug: byId("btn-lan-copy-debug"),
    mainLayout: byId("main-layout"),
    rightEditorPanel: byId("right-editor-panel"),
    appModeStrip: byId("app-mode-strip"),
    appModeLocal: byId("app-mode-local"),
    appModeTemplate: byId("app-mode-template"),
    panelLocalShell: byId("panel-local-shell"),
    panelTemplateShell: byId("panel-template-shell"),
    topbarShellLocalOnly: byId("topbar-shell-local-only"),
    btnApplyTemplate: byId("btn-apply-template"),
    btnViewPendingTemplates: byId("btn-view-pending-templates"),
    btnSyncTemplates: byId("btn-sync-templates"),
    btnViewPendingFonts: byId("btn-view-pending-fonts"),
    btnSyncFonts: byId("btn-sync-fonts"),
    btnSyncDisp: byId("btn-sync-disp"),
    fontPendingDialog: byId("font-pending-dialog"),
    fontPendingTitle: byId("font-pending-title"),
    fontPendingHint: byId("font-pending-hint"),
    fontPendingList: byId("font-pending-list"),
    btnFontPendingSelectAll: byId("btn-font-pending-select-all"),
    btnFontPendingSelectNone: byId("btn-font-pending-select-none"),
    btnFontPendingCancel: byId("btn-font-pending-cancel"),
    btnFontPendingDownload: byId("btn-font-pending-download"),
    fontDownloadProgress: byId("font-download-progress"),
    fontDownloadStatus: byId("font-download-status"),
    templateSyncStatus: byId("template-sync-status"),
    templateBrowseCard: byId("template-browse-card"),
    templatePendingCard: byId("template-pending-card"),
    lblTemplatePending: byId("lbl-template-pending"),
    templatePendingHint: byId("template-pending-hint"),
    btnTemplatePendingBack: byId("btn-template-pending-back"),
    templatePendingCategoryRail: byId("template-pending-category-rail"),
    templatePendingList: byId("template-pending-list"),
    templateDownloadDialog: byId("template-download-dialog"),
    templateDownloadTitle: byId("template-download-title"),
    templateDownloadProgress: byId("template-download-progress"),
    templateDownloadStatus: byId("template-download-status"),
    browseTemplateToolbarHint: byId("browse-template-toolbar-hint"),
    btnNewWatchface: byId("btn-new-watchface"),
    btnImportWatchface: byId("btn-import-watchface"),
    inputImportWatchfaceJson: byId("input-import-watchface-json"),
    localWatchHint: byId("local-watch-hint"),
    localWatchfaceList: byId("local-watchface-list"),
    secCanvasTitle: byId("sec-canvas-title"),
    secBackgroundTitle: byId("sec-background-title"),
    secAppPreviewTitle: byId("sec-app-preview-title"),
    secWatchDescTitle: byId("sec-watch-desc-title"),
    secItemlistTitle: byId("sec-itemlist-title"),
    secEditorTitle: byId("sec-editor-title"),
    lblTemplateCategory: byId("lbl-template-category"),
    lblInputZoom: byId("lbl-input-zoom"),
    lblInputBgFile: byId("lbl-input-bg-file"),
    lblBgSourcePath: byId("lbl-bg-source-path"),
    lblInputAppPreviewFile: byId("lbl-input-app-preview-file"),
    lblAppPreviewSourcePath: byId("lbl-app-preview-source-path"),
    lblDescCn: byId("lbl-desc-cn"),
    lblDescEn: byId("lbl-desc-en"),
    lblCurrentClock: byId("lbl-current-clock"),
    lblClockId: byId("lbl-clock-id"),
    lblItemCount: byId("lbl-item-count"),
    legendImage: byId("legend-image"),
    legendText: byId("legend-text"),
    legendPointer: byId("legend-pointer"),
    selectTemplateCategory: byId("select-template-category"),
    templateCategoryRail: byId("template-category-rail"),
    templateHint: byId("template-hint"),
    templateList: byId("template-list"),
    inputZoom: byId("input-zoom"),
    txtZoom: byId("txt-zoom"),
    inputBgFile: byId("input-bg-file"),
    txtBgSourcePath: byId("txt-bg-source-path"),
    btnClearBg: byId("btn-clear-bg"),
    inputAppPreviewFile: byId("input-app-preview-file"),
    txtAppPreviewSourcePath: byId("txt-app-preview-source-path"),
    btnClearAppPreview: byId("btn-clear-app-preview"),
    txtDescCn: byId("txt-desc-cn"),
    txtDescEn: byId("txt-desc-en"),
    btnLanApplyWatchfaceConfig: byId("btn-lan-apply-config"),
    btnLanShowCurrentClockOnDevice: byId("btn-lan-show-current-clock"),
    btnLanCreateOnDevice: byId("btn-lan-create-on-device"),
    lanCreateDialog: byId("lan-create-dialog"),
    lanCreateForm: byId("lan-create-form"),
    lanCreateBody: byId("lan-create-body"),
    lanCreateCancel: byId("lan-create-cancel"),
    lanCreateSubmit: byId("lan-create-submit"),
    lanCreateTitle: byId("lan-create-title"),
    lanMessageDialog: byId("lan-message-dialog"),
    lanMessageDialogBody: byId("lan-message-dialog-body"),
    lanMessageDialogOk: byId("lan-message-dialog-ok"),
    localSaveNamedDialog: byId("local-save-named-dialog"),
    localSaveNamedTitle: byId("local-save-named-title"),
    localSaveNamedBody: byId("local-save-named-body"),
    localSaveNamedLabel: byId("local-save-named-label"),
    localSaveNamedInput: byId("local-save-named-input"),
    localSaveNamedLater: byId("local-save-named-later"),
    localSaveNamedDiscard: byId("local-save-named-discard"),
    localSaveNamedCancel: byId("local-save-named-cancel"),
    localSaveNamedSubmit: byId("local-save-named-submit"),
    // Left font resource panel is removed, keep these optional for compatibility.
    inputFontFilter: byId("input-font-filter"),
    builtinFontList: byId("builtin-font-list"),
    selectFontPreview: byId("select-font-preview"),
    inputFontPreviewText: byId("input-font-preview-text"),
    fontPreviewCanvas: byId("font-preview-canvas"),
    fontStatus: byId("font-status"),
    txtClockTitle: byId("txt-clock-title"),
    txtClockId: byId("txt-clock-id"),
    txtItemCount: byId("txt-item-count"),
    canvas: byId("watchface-canvas"),
    previewStage: byId("preview-stage"),
    itemList: byId("item-list"),
    btnAddItem: byId("btn-add-item"),
    btnDupItem: byId("btn-dup-item"),
    btnDelItem: byId("btn-del-item"),
    btnItemUp: byId("btn-item-up"),
    btnItemDown: byId("btn-item-down"),
    itemEditor: byId("item-editor"),
    fileProtocolBanner: byId("file-protocol-banner"),
    fileBannerTitle: byId("file-banner-title"),
    fileBannerBody: byId("file-banner-body"),
    btnDismissFileBanner: byId("btn-dismiss-file-banner"),
    btnAbout: byId("btn-about"),
    aboutDialog: byId("about-dialog"),
    aboutTitle: byId("about-title"),
    aboutIntro: byId("about-intro"),
    aboutDblhint: byId("about-dblhint"),
    aboutVersionLine: byId("about-version-line"),
    aboutDoubleclickZone: byId("about-doubleclick-zone"),
    aboutClose: byId("about-close"),
    aboutAdminExit: byId("about-admin-exit"),
    adminModeBadge: byId("admin-mode-badge"),
    adminPasswordDialog: byId("admin-password-dialog"),
    adminPasswordTitle: byId("admin-password-title"),
    adminPasswordCaption: byId("admin-password-caption"),
    adminPasswordFieldRow: byId("admin-password-field-row"),
    adminPasswordLabelText: byId("admin-password-label-text"),
    adminPasswordInput: byId("admin-password-input"),
    adminPasswordStatus: byId("admin-password-status"),
    adminPasswordCancel: byId("admin-password-cancel"),
    adminPasswordSubmit: byId("admin-password-submit")
  };

  /** 模板列表依赖的节点：避免极少数环境下脚本早于节点插入导致 byId 为 null。 */
  function syncTemplateDomRefs() {
    const sel = byId("select-template-category");
    const rail = byId("template-category-rail");
    const hint = byId("template-hint");
    const list = byId("template-list");
    const bgPath = byId("txt-bg-source-path");
    const lblBgPath = byId("lbl-bg-source-path");
    const appPreviewPath = byId("txt-app-preview-source-path");
    const lblAppPreviewPath = byId("lbl-app-preview-source-path");
    if (sel) dom.selectTemplateCategory = sel;
    if (rail) dom.templateCategoryRail = rail;
    if (hint) dom.templateHint = hint;
    if (list) dom.templateList = list;
    if (bgPath) dom.txtBgSourcePath = bgPath;
    if (lblBgPath) dom.lblBgSourcePath = lblBgPath;
    if (appPreviewPath) dom.txtAppPreviewSourcePath = appPreviewPath;
    if (lblAppPreviewPath) dom.lblAppPreviewSourcePath = lblAppPreviewPath;
    const btnViewPending = byId("btn-view-pending-templates");
    const btnSync = byId("btn-sync-templates");
    const syncStatus = byId("template-sync-status");
    if (btnViewPending) dom.btnViewPendingTemplates = btnViewPending;
    if (btnSync) dom.btnSyncTemplates = btnSync;
    if (syncStatus) dom.templateSyncStatus = syncStatus;
  }

  const watchCtx = dom.canvas.getContext("2d");
  const fontPreviewCtx = dom.fontPreviewCanvas?.getContext("2d") || null;
  let currentLanguageEnum = DEFAULT_LANGUAGE_ENUM;

  const state = {
    width: EDITOR_CANVAS_WIDTH,
    height: EDITOR_CANVAS_HEIGHT,
    zoom: 55,
    config: {
      ClockId: 0,
      NameCn: "Untitled",
      ItemList: [],
      ItemIdList: []
    },
    selectedIndex: -1,
    previewTextOverrides: new Map(),
    backgroundImage: null,
    backgroundName: "",
    backgroundObjectUrl: "",
    /** 模板底图等：只读框展示的绝对 URL 或本地上传说明（浏览器无法取得真实磁盘路径） */
    backgroundSourceLabel: "",
    appPreviewImage: null,
    appPreviewName: "",
    appPreviewObjectUrl: "",
    /** APP 预览图：只读框展示的绝对 URL 或本地上传说明 */
    appPreviewSourceLabel: "",
    tickHandle: null
  };

  /** AstroToo 固定方形逻辑分辨率；加载模板/配置时始终回到此尺寸。 */
  function syncEditorCanvasDimensions() {
    state.width = EDITOR_CANVAS_WIDTH;
    state.height = EDITOR_CANVAS_HEIGHT;
  }

  let photoAlbumDemoImages = [];
  const photoAlbumPreviewItemState = new WeakMap();

  let lanBaselineSignature = "";
  /** 上次 captureLanBaseline 时的背景名，用于在 PATCH 时判断 dial 底图是否需要重传。 */
  let lanBaselineBgName = "";

  /**
   * 设备 PATCH（`wf_apply_item_patch` in `divoom_watchface_local_api.c`）允许按字段级补丁的列表。
   * 这里只列固件实际识别的字段；其它字段（如 `frameCount`）不会被设备读取，避免误发。
   */
  const LAN_PATCH_NUMBER_FIELDS = Object.freeze([
    "size",
    "x",
    "y",
    "w",
    "h",
    "disp",
    "alig",
    "sep",
    "font",
    "image_id",
    "angle",
    "hier",
    "transp",
    "animation"
  ]);
  const LAN_PATCH_HEX_COLOR_FIELDS = Object.freeze(["color_1", "color_2"]);

  /** 「我的设计」当前条目 id（空 = 未绑定已命名保存） */
  let activeLocalWatchfaceId = "";
  /** 判断相对上次保存/加载是否有修改（含未命名草稿） */
  let workspaceBaselineSig = "";
  let namingPromptDismissed = false;
  let autosaveTimer = 0;
  let namingDebounceTimer = 0;
  /** 文件选择等原生对话框需要主线程空闲；>0 时暂停表盘预览定时器。 */
  let watchfaceTickPauseDepth = 0;
  const persistImageCache = {
    bg: { key: "", dataUrl: null },
    appPreview: { key: "", dataUrl: null }
  };
  let saveNamedDialogResolver = null;
  /** 左侧：`local`=可编辑本地；`template`=仅浏览内置模板预览 */
  let sidebarBrowseMode = "local";
  let templateListNavTimer = 0;
  /** 模板模式下按预览区尺寸自动缩放画布 */
  let previewStageResizeObs = null;

  function syncWorkspaceBaseline() {
    workspaceBaselineSig = getLanDirtySnapshot();
  }

  function isWorkspaceDirtyVsBaseline() {
    if (!workspaceBaselineSig) return false;
    return getLanDirtySnapshot() !== workspaceBaselineSig;
  }

  function isWorkspaceDirtyUnsaved() {
    return isWorkspaceDirtyVsBaseline() && !activeLocalWatchfaceId;
  }

  const templateState = {
    ids: [],
    metaById: new Map(),
    classifyRows: [],
    selectedClassifyId: null,
    activeClockId: null,
    loading: false,
    error: "",
    source: "",
    loadToken: 0
  };

  const runtime = {
    fontCfgPath: "",
    fontBasePaths: [
      withBase("font/"),
      "./font/",
      "font/",
      "./html/font/",
      "../font/",
      "../html/font/",
      "/font/",
      "/html/font/"
    ]
  };

  const localDispAssets = new Map();

  function getLocalDispAsset(item) {
    return item ? (localDispAssets.get(item) || null) : null;
  }

  function clearLocalDispAsset(item) {
    if (!item) return;
    const old = localDispAssets.get(item);
    if (Array.isArray(old?.frames)) {
      for (const frame of old.frames) {
        if (frame && typeof frame.close === "function") {
          try {
            frame.close();
          } catch (e) {
            // ignore
          }
        }
      }
    }
    if (old?.objectUrl) {
      try {
        URL.revokeObjectURL(old.objectUrl);
      } catch (e) {
        // ignore
      }
    }
    localDispAssets.delete(item);
  }

  function setLocalDispAsset(item, asset) {
    if (!item) return;
    clearLocalDispAsset(item);
    if (asset) localDispAssets.set(item, asset);
  }

  function clearAllLocalDispAssets() {
    for (const asset of localDispAssets.values()) {
      if (Array.isArray(asset?.frames)) {
        for (const frame of asset.frames) {
          if (frame && typeof frame.close === "function") {
            try {
              frame.close();
            } catch (e) {
              // ignore
            }
          }
        }
      }
      if (asset?.objectUrl) {
        try {
          URL.revokeObjectURL(asset.objectUrl);
        } catch (e) {
          // ignore
        }
      }
    }
    localDispAssets.clear();
  }

  function clearBackgroundObjectUrl() {
    if (!state.backgroundObjectUrl) return;
    try {
      URL.revokeObjectURL(state.backgroundObjectUrl);
    } catch (e) {
      // ignore
    }
    state.backgroundObjectUrl = "";
  }

  function setBackgroundFromAsset(asset) {
    clearBackgroundObjectUrl();
    if (!asset?.image) {
      state.backgroundImage = null;
      state.backgroundName = "";
      return;
    }
    state.backgroundImage = asset.image;
    state.backgroundName = asset.name || "";
    state.backgroundObjectUrl = String(asset.objectUrl || "");
  }

  function clearAppPreviewObjectUrl() {
    if (!state.appPreviewObjectUrl) return;
    try {
      URL.revokeObjectURL(state.appPreviewObjectUrl);
    } catch (e) {
      // ignore
    }
    state.appPreviewObjectUrl = "";
  }

  function clearAppPreviewState() {
    clearAppPreviewObjectUrl();
    invalidatePersistImageCache("appPreview");
    state.appPreviewImage = null;
    state.appPreviewName = "";
    state.appPreviewSourceLabel = "";
    if (dom.inputAppPreviewFile) dom.inputAppPreviewFile.value = "";
    if (state.config && typeof state.config === "object") state.config.AppImageUrl = "";
    refreshAppPreviewSourceLabel();
  }

  function setAppPreviewFromAsset(asset) {
    clearAppPreviewObjectUrl();
    if (!asset?.image) {
      state.appPreviewImage = null;
      state.appPreviewName = "";
      return;
    }
    state.appPreviewImage = asset.image;
    state.appPreviewName = asset.name || "";
    state.appPreviewObjectUrl = String(asset.objectUrl || "");
  }

  function isTemplateImageItem(item) {
    const disp = toNum(item?.disp, 0);
    return (
      POINTER_DISP_IDS.has(disp) ||
      IMAGE_DISP_IDS.has(disp) ||
      isLocalAssetDisp(disp) ||
      toNum(item?.image_id, 0) > 0 ||
      !!String(item?.image_addr || "")
    );
  }

  function getTemplateSlotByItem(clockId, item) {
    const disp = toNum(item?.disp, 0);
    const offset = TEMPLATE_DISP_OFFSET_TABLE[disp];
    if (Number.isFinite(offset) && offset >= 0) {
      return clockId * TEMPLATE_IMAGE_SLOT_COUNT + offset + 1;
    }
    const imageId = toNum(item?.image_id, 0);
    if (imageId > 0 && imageId <= TEMPLATE_IMAGE_SLOT_COUNT) {
      // image_id 在部分配置中可能直接是 1..128 槽位编号。
      return clockId * TEMPLATE_IMAGE_SLOT_COUNT + imageId;
    }
    if (imageId > TEMPLATE_IMAGE_SLOT_COUNT) {
      return imageId;
    }
    return null;
  }

  function parseTemplateIdsFromDirectoryText(text) {
    const src = String(text || "");
    const set = new Set();
    const re = /(\d+)\.cfg/ig;
    let m = null;
    while ((m = re.exec(src)) !== null) {
      const id = toNum(m[1], NaN);
      if (Number.isFinite(id) && id >= 0) set.add(id);
    }
    return [...set].sort((a, b) => a - b);
  }

  function collectTemplateCandidateIdsFromReport(report) {
    const set = new Set();
    const stats = report?.stats || {};
    const push = (v) => {
      const id = toNum(v, NaN);
      if (Number.isFinite(id) && id >= 0) set.add(id);
    };
    for (const id of Array.isArray(stats.configMissing) ? stats.configMissing : []) push(id);
    for (const row of Array.isArray(stats.dir15Missing) ? stats.dir15Missing : []) push(row?.id);
    for (const row of Array.isArray(stats.dir29MissingById) ? stats.dir29MissingById : []) push(row?.id);
    return [...set];
  }

  /** 内置模板分类表中的 clockId，用于扩充探测上界（report 里只有「缺失」id 时不得作为探测下界）。 */
  function collectClassifyCatalogClockIds() {
    const set = new Set();
    const classifyList = Array.isArray(getTemplateClassifyData()?.ClassifyList) ? getTemplateClassifyData().ClassifyList : [];
    for (const row of classifyList) {
      for (const id of Array.isArray(row.clockid) ? row.clockid : []) {
        const n = toNum(id, NaN);
        if (Number.isFinite(n) && n > 0) set.add(n);
      }
    }
    return [...set];
  }

  const fontStore = new FontStore(
    (txt) => {
      if (dom.fontStatus) dom.fontStatus.textContent = txt || "";
    },
    () => {
      refreshFontPreviewSelect();
      refreshItemListUi();
      rebuildItemEditor();
      renderWatchface();
      renderFontPreview();
    }
  );

  const dispCatalogStore = new DispCatalogStore(getLocaleCode, () => {
    refreshItemListUi();
    rebuildItemEditor();
  });

  let dispCatalogSyncing = false;

  const editorFields = [
    { key: "item_id", type: "text", labelKey: "editor.itemId", full: true },
    { key: "info", type: "text", labelKey: "editor.info", full: true },
    { key: "disp", type: "disp-select", labelKey: "editor.disp" },
    { key: "font", type: "font-select", labelKey: "editor.font" },
    { key: "__preview_text__", type: "text", labelKey: "editor.previewText", full: true },
    { key: "size", type: "number", labelKey: "editor.size" },
    { key: "x", type: "number", labelKey: "editor.x" },
    { key: "y", type: "number", labelKey: "editor.y" },
    { key: "w", type: "number", labelKey: "editor.w" },
    { key: "h", type: "number", labelKey: "editor.h" },
    {
      key: "hier",
      type: "hier-tier",
      labelKey: "editor.hierTier"
    },
    { key: "alig", type: "align-select", labelKey: "editor.align" },
    { key: "sep", type: "number", labelKey: "editor.sep" },
    { key: "transp", type: "number", labelKey: "editor.transp" },
    { key: "color_1", type: "color-palette", labelKey: "editor.color1" },
    { key: "color_2", type: "color-palette", labelKey: "editor.color2" }
  ];

  const PRESET_COLORS = [
    "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
    "#ff00ff", "#00ffff", "#ff8c00", "#8a2be2", "#00bcd4", "#8fd2ff",
    "#90ee90", "#ffd700", "#ffa7c4", "#7f8c8d", "#2c3e50", "#e74c3c"
  ];
  const IMAGE_EDITOR_HIDDEN_FIELDS = new Set(["font", "size", "sep", "alig", "color_1", "color_2", "transp"]);
  /** 图像字体仅使用排版矩形与对齐；其余样式项在设备侧无效，编辑面板中隐藏。 */
  const IMAGE_FONT_EDITOR_VISIBLE_KEYS = new Set([
    "item_id",
    "info",
    "disp",
    "font",
    "__preview_text__",
    "x",
    "y",
    "w",
    "h",
    "hier",
    "alig"
  ]);

  function setNodeText(node, value) {
    if (!node) return;
    node.textContent = String(value ?? "");
  }

  /** 「我的设计」且 ClockId=0 时不展示 “ClockId: 0”，改为未上传提示（模板浏览仍显示 ID）。 */
  function refreshToolbarClockIdUi() {
    if (dom.txtClockId && dom.lblClockId) {
      const cid = toNum(state.config?.ClockId, 0);
      if (sidebarBrowseMode === "local" && cid === 0) {
        dom.lblClockId.hidden = true;
        dom.txtClockId.textContent = t("ui.toolbar.clockIdNotUploaded");
      } else {
        dom.lblClockId.hidden = false;
        dom.lblClockId.textContent = t("ui.toolbar.clockId");
        dom.txtClockId.textContent = String(cid);
      }
    }
    refreshLanActionButtons();
  }

  function readAdminUnlockFromStorage() {
    try {
      return localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function persistAdminUnlock(enabled) {
    try {
      if (enabled) localStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, "1");
      else localStorage.removeItem(ADMIN_UNLOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function configureAdminGateDialog(openUnlockedVariant) {
    if (!dom.adminPasswordDialog) return;
    const unlocked = Boolean(openUnlockedVariant);
    if (dom.adminPasswordTitle)
      setNodeText(dom.adminPasswordTitle, unlocked ? t("about.adminAlreadyTitle") : t("about.adminPwdTitle"));
    if (dom.adminPasswordCaption)
      setNodeText(
        dom.adminPasswordCaption,
        unlocked ? t("about.adminAlreadyBody") : t("about.adminPwdCaption")
      );
    if (dom.adminPasswordLabelText) setNodeText(dom.adminPasswordLabelText, t("about.adminPwdLabel"));
    if (dom.adminPasswordFieldRow) dom.adminPasswordFieldRow.hidden = unlocked;
    if (dom.adminPasswordInput) {
      dom.adminPasswordInput.value = "";
      dom.adminPasswordInput.disabled = unlocked;
      dom.adminPasswordInput.required = !unlocked;
    }
    if (dom.adminPasswordStatus) dom.adminPasswordStatus.textContent = "";
    if (dom.adminPasswordCancel) setNodeText(dom.adminPasswordCancel, t("lan.dialog.cancel"));
    if (dom.adminPasswordSubmit)
      setNodeText(dom.adminPasswordSubmit, unlocked ? t("about.adminPwdOk") : t("about.adminPwdSubmit"));
  }

  function syncAdminUnlockUi() {
    const on = readAdminUnlockFromStorage();
    document.documentElement.classList.toggle("editor-admin-mode", on);
    if (dom.adminModeBadge) {
      dom.adminModeBadge.hidden = !on;
      if (on) setNodeText(dom.adminModeBadge, t("about.adminBadge"));
    }
    if (dom.aboutAdminExit) {
      dom.aboutAdminExit.hidden = !on;
      setNodeText(dom.aboutAdminExit, t("about.adminExit"));
    }
    if (!dom.adminPasswordDialog?.open)
      configureAdminGateDialog(readAdminUnlockFromStorage());
    refreshTemplateSyncUi();
    refreshSidebarBrowseChrome();
  }

  function refreshAboutDialogsI18n() {
    if (dom.aboutTitle) setNodeText(dom.aboutTitle, t("about.title"));
    if (dom.aboutIntro) setNodeText(dom.aboutIntro, t("about.intro"));
    if (dom.aboutDblhint) setNodeText(dom.aboutDblhint, t("about.dblhint"));
    if (dom.aboutVersionLine) setNodeText(dom.aboutVersionLine, t("about.versionLine", { version: APP_BUILD_NUMBER }));
    if (dom.aboutDoubleclickZone)
      dom.aboutDoubleclickZone.setAttribute("aria-label", t("about.dblAria"));
    if (dom.btnAbout) setNodeText(dom.btnAbout, t("about.open"));
    if (dom.aboutClose) setNodeText(dom.aboutClose, t("about.close"));
    syncAdminUnlockUi();
    configureAdminGateDialog(readAdminUnlockFromStorage());
  }

  function wireAboutAdminUi() {
    if (dom.btnAbout && dom.aboutDialog?.showModal) {
      dom.btnAbout.addEventListener("click", () => {
        refreshAboutDialogsI18n();
        dom.aboutDialog.showModal();
      });
    }
    if (dom.aboutClose && dom.aboutDialog) dom.aboutClose.addEventListener("click", () => dom.aboutDialog.close());
    if (dom.aboutAdminExit) {
      dom.aboutAdminExit.addEventListener("click", () => {
        persistAdminUnlock(false);
        syncAdminUnlockUi();
        fontStore.log(t("about.adminLoggedOut"));
      });
    }
    const openGate = () => {
      configureAdminGateDialog(readAdminUnlockFromStorage());
      if (dom.adminPasswordDialog?.showModal) dom.adminPasswordDialog.showModal();
    };
    if (dom.aboutDoubleclickZone)
      dom.aboutDoubleclickZone.addEventListener("dblclick", (e) => {
        e.preventDefault();
        openGate();
      });

    const closeGate = () => {
      dom.adminPasswordDialog?.close?.();
      if (dom.adminPasswordInput) dom.adminPasswordInput.value = "";
      if (dom.adminPasswordStatus) dom.adminPasswordStatus.textContent = "";
    };

    if (dom.adminPasswordCancel) dom.adminPasswordCancel.addEventListener("click", closeGate);

    if (dom.adminPasswordSubmit && dom.adminPasswordDialog) {
      dom.adminPasswordSubmit.addEventListener("click", () => {
        if (readAdminUnlockFromStorage()) {
          closeGate();
          return;
        }
        const raw = dom.adminPasswordInput ? String(dom.adminPasswordInput.value || "") : "";
        if (raw === ADMIN_GATE_PASSWORD) {
          persistAdminUnlock(true);
          syncAdminUnlockUi();
          refreshTemplateSyncUi();
          if (dom.adminPasswordStatus)
            dom.adminPasswordStatus.textContent = t("about.adminPwdSuccess");
          fontStore.log(t("about.adminUnlocked"));
          window.setTimeout(() => closeGate(), 450);
          return;
        }
        if (dom.adminPasswordStatus)
          dom.adminPasswordStatus.textContent = t("about.adminPwdWrong");
      });
    }

    if (dom.adminPasswordInput && dom.adminPasswordSubmit) {
      dom.adminPasswordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          dom.adminPasswordSubmit.click();
        }
      });
    }
  }

  function applyStaticI18n() {
    document.documentElement.lang = getLocaleCode();
    document.title = t("ui.appTitle");
    setNodeText(dom.appTitle, t("ui.appTitle"));
    setNodeText(dom.appSubtitle, t("ui.appSubtitle"));
    setNodeText(dom.lblLang, t("ui.language"));
    if (dom.lblLanDevice) setNodeText(dom.lblLanDevice, t("ui.label.lanDevice"));
    if (dom.btnRefreshLanDevices) setNodeText(dom.btnRefreshLanDevices, t("ui.btn.refreshLanDevices"));
    if (dom.btnLanCopyDebug) {
      setNodeText(dom.btnLanCopyDebug, t("ui.btn.lanCopyDebug"));
      dom.btnLanCopyDebug.title = t("ui.btn.lanCopyDebugTitle");
    }
    if (dom.selectLanDevice?.options?.length && dom.selectLanDevice.options[0].value === "") {
      dom.selectLanDevice.options[0].textContent = t("lan.device.placeholder");
    }

    if (dom.appModeLocal) setNodeText(dom.appModeLocal, t("ui.tab.localWatchfaces"));
    if (dom.appModeTemplate) setNodeText(dom.appModeTemplate, t("ui.tab.templateWatchfaces"));
    if (dom.btnApplyTemplate) setNodeText(dom.btnApplyTemplate, t("ui.btn.applyTemplate"));
    if (dom.btnViewPendingTemplates) {
      const pendingCount = countPendingTemplateItems(pendingTemplateState.classifyRows);
      setNodeText(dom.btnViewPendingTemplates, t("template.btn.viewPending", { count: pendingCount }));
      dom.btnViewPendingTemplates.title = t("template.btn.viewPendingTitle");
    }
    if (dom.btnSyncTemplates) {
      setNodeText(dom.btnSyncTemplates, t("template.btn.sync"));
      dom.btnSyncTemplates.title = t("template.btn.syncTitle");
    }
    if (dom.btnViewPendingFonts) {
      const fontPendingCount = countPendingFontItems(pendingFontState.items);
      setNodeText(dom.btnViewPendingFonts, t("font.btn.viewPending", { count: fontPendingCount }));
      dom.btnViewPendingFonts.title = t("font.btn.viewPendingTitle");
    }
    if (dom.btnSyncFonts) {
      setNodeText(dom.btnSyncFonts, t("font.btn.sync"));
      dom.btnSyncFonts.title = t("font.btn.syncTitle");
    }
    if (dom.btnSyncDisp) {
      setNodeText(dom.btnSyncDisp, t("disp.btn.sync"));
      dom.btnSyncDisp.title = t("disp.btn.syncTitle");
    }
    if (dom.fontPendingTitle) setNodeText(dom.fontPendingTitle, t("font.pending.title"));
    if (dom.btnFontPendingSelectAll) setNodeText(dom.btnFontPendingSelectAll, t("font.pending.selectAll"));
    if (dom.btnFontPendingSelectNone) setNodeText(dom.btnFontPendingSelectNone, t("font.pending.selectNone"));
    if (dom.btnFontPendingCancel) setNodeText(dom.btnFontPendingCancel, t("font.pending.cancel"));
    if (dom.btnFontPendingDownload) setNodeText(dom.btnFontPendingDownload, t("font.pending.downloadSelected"));
    if (dom.lblTemplatePending) setNodeText(dom.lblTemplatePending, t("template.pending.title"));
    if (dom.btnTemplatePendingBack) setNodeText(dom.btnTemplatePendingBack, t("template.pending.back"));
    if (dom.templateDownloadTitle && !pendingTemplateState.downloading) {
      setNodeText(dom.templateDownloadTitle, t("template.pending.downloadingTitle", { name: "" }));
    }

    setNodeText(dom.secCanvasTitle, t("ui.sec.canvas"));
    setNodeText(dom.secBackgroundTitle, t("ui.sec.background"));
    if (dom.secAppPreviewTitle) setNodeText(dom.secAppPreviewTitle, t("ui.sec.appPreview"));
    if (dom.secWatchDescTitle) setNodeText(dom.secWatchDescTitle, t("ui.sec.watchDesc"));
    if (dom.lblDescCn) setNodeText(dom.lblDescCn, t("ui.label.descCn"));
    if (dom.lblDescEn) setNodeText(dom.lblDescEn, t("ui.label.descEn"));
    setNodeText(dom.secItemlistTitle, t("ui.sec.items"));
    setNodeText(dom.secEditorTitle, t("ui.sec.editor"));

    if (dom.btnNewWatchface) setNodeText(dom.btnNewWatchface, t("ui.btn.newWatchface"));
    if (dom.btnImportWatchface) {
      setNodeText(dom.btnImportWatchface, t("ui.btn.importWatchface"));
      dom.btnImportWatchface.setAttribute("aria-label", t("ui.btn.importWatchfaceAria"));
    }
    setNodeText(dom.lblTemplateCategory, t("ui.sec.templateCategory"));
    if (dom.appModeStrip) dom.appModeStrip.setAttribute("aria-label", t("ui.aria.appModeTabs"));
    if (dom.templateCategoryRail) dom.templateCategoryRail.setAttribute("aria-label", t("ui.aria.templateCategoryRail"));
    setNodeText(dom.lblInputZoom, t("ui.label.zoom"));
    setNodeText(dom.lblInputBgFile, t("ui.label.bgFile"));
    if (dom.lblBgSourcePath) setNodeText(dom.lblBgSourcePath, t("ui.label.bgSourcePath"));
    if (dom.lblInputAppPreviewFile) setNodeText(dom.lblInputAppPreviewFile, t("ui.label.appPreviewFile"));
    if (dom.lblAppPreviewSourcePath) setNodeText(dom.lblAppPreviewSourcePath, t("ui.label.appPreviewSourcePath"));
    setNodeText(dom.btnClearBg, t("ui.btn.clearBg"));
    if (dom.btnClearAppPreview) setNodeText(dom.btnClearAppPreview, t("ui.btn.clearAppPreview"));
    if (dom.btnLanApplyWatchfaceConfig)
      setNodeText(dom.btnLanApplyWatchfaceConfig, t("ui.btn.lanApplyWatchfaceConfig"));
    if (dom.btnLanShowCurrentClockOnDevice)
      setNodeText(dom.btnLanShowCurrentClockOnDevice, t("ui.btn.lanShowCurrentClockOnDevice"));
    if (dom.btnLanCreateOnDevice) setNodeText(dom.btnLanCreateOnDevice, t("ui.btn.lanCreate"));
    if (dom.lanCreateTitle) setNodeText(dom.lanCreateTitle, t("lan.dialog.confirmCreateTitle"));
    if (dom.lanCreateCancel) setNodeText(dom.lanCreateCancel, t("lan.dialog.cancel"));
    if (dom.lanCreateSubmit) setNodeText(dom.lanCreateSubmit, t("lan.dialog.submit"));
    if (dom.lanMessageDialogOk) setNodeText(dom.lanMessageDialogOk, t("lan.dialog.ok"));

    setNodeText(dom.btnAddItem, t("ui.btn.add"));
    setNodeText(dom.btnDupItem, t("ui.btn.dup"));
    setNodeText(dom.btnDelItem, t("ui.btn.del"));
    setNodeText(dom.btnItemUp, t("ui.btn.up"));
    setNodeText(dom.btnItemDown, t("ui.btn.down"));

    setNodeText(dom.lblCurrentClock, t("ui.toolbar.currentClock"));
    setNodeText(dom.lblItemCount, t("ui.toolbar.itemCount"));
    setNodeText(dom.legendImage, t("ui.legend.image"));
    setNodeText(dom.legendText, t("ui.legend.text"));
    setNodeText(dom.legendPointer, t("ui.legend.pointer"));

    setNodeText(dom.fileBannerTitle, t("ui.fileProtocol.title"));
    setNodeText(dom.fileBannerBody, t("ui.fileProtocol.body"));
    setNodeText(dom.btnDismissFileBanner, t("ui.fileProtocol.dismiss"));

    refreshAboutDialogsI18n();
    if (!state.config?.ItemList?.length) setNodeText(dom.txtClockTitle, t("ui.default.clockNotLoaded"));
    else setNodeText(dom.txtClockTitle, getClockDisplayName(state.config));
    refreshToolbarClockIdUi();
  }

  function rebuildLanguageSelector() {
    if (!dom.selectLang) return;
    const old = normalizeLanguageEnum(dom.selectLang.value) || currentLanguageEnum;
    dom.selectLang.innerHTML = "";
    for (const row of LANGUAGE_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = row.value;
      opt.textContent = row.label;
      dom.selectLang.appendChild(opt);
    }
    dom.selectLang.value = normalizeLanguageEnum(old) || DEFAULT_LANGUAGE_ENUM;
  }

  function applyLanguage(nextLanguageEnum, shouldPersist = true) {
    const normalized = normalizeLanguageEnum(nextLanguageEnum) || DEFAULT_LANGUAGE_ENUM;
    currentLanguageEnum = setLanguage(normalized, shouldPersist);
    rebuildLanguageSelector();
    applyStaticI18n();
    refreshFontPreviewSelect();
    refreshBuiltinFontList();
    refreshItemListUi();
    refreshTemplateCategorySelectorUi();
    refreshTemplateListUi();
    rebuildItemEditor();
    renderWatchface();
    renderFontPreview();
    refreshLanActionButtons();
    refreshLocalWatchfaceListUi();
    refreshSidebarBrowseChrome();
  }

  function createDefaultItem(index) {
    const first = fontStore.getAllMetas()[0];
    const fontId = first ? first.id : 0;
    return {
      ...DEFAULT_ITEM,
      font: fontId,
      hier: 0,
      item_id: `item_${index + 1}`
    };
  }

  function normalizeItem(raw, index) {
    const item = { ...createDefaultItem(index), ...(raw || {}) };
    if (item.item_id === undefined || item.item_id === null) item.item_id = `item_${index + 1}`;
    item.color_1 = ensureColorHex(item.color_1, "#ffffff");
    item.color_2 = ensureColorHex(item.color_2, "#000000");
    item.disp = toNum(item.disp ?? item.type, item.disp ?? 4);
    item.font = resolveItemFontId(item);
    item.size = toNum(item.size ?? item.font_size, toNum(item.size, 32));
    item.x = toNum(item.x, 0);
    item.y = toNum(item.y, 0);
    item.w = toNum(item.w, 100);
    item.h = toNum(item.h, 40);
    item.alig = normalizeAligToDevice(item.alig ?? item.align);
    item.sep = toNum(item.sep, 0);
    item.angle = toNum(item.angle, 0);
    item.hier = toNum(item.hier, 0);
    item.transp = toNum(item.transp, 100);
    item.animation = toNum(item.animation, 0);
    item.image_id = toNum(item.image_id, 0);
    item.image_addr = String(item.image_addr || "");
    if (item.info === undefined && item.desc !== undefined) item.info = item.desc;
    item.info = String(item.info ?? "");
    delete item.desc;
    return item;
  }

  /**
   * 设备固件 `divoom_watchface_local_api.c` 第 1534 行：`NEED_STR("item_id")` —— 每条 ItemList
   * 的 `item_id` 必须是**非空字符串**，否则 CreateLocalClock / PatchLocalClockInfo 直接报
   * `ItemList[i]: missing or empty string "item_id"`。模板里常见空串需在下发前补默认值。
   */
  function itemIdListEntryForLan(it, idx) {
    const raw = it?.item_id;
    const s = raw === undefined || raw === null ? "" : String(raw);
    return s.length > 0 ? s : `item_${idx + 1}`;
  }

  function normalizeConfig(raw) {
    let base;
    if (Array.isArray(raw)) {
      base = { ItemList: raw };
    } else if (raw && typeof raw === "object") {
      if (Array.isArray(raw.ItemList)) base = { ...raw };
      else if (Array.isArray(raw.CmdData?.ItemList)) base = { ...raw.CmdData };
      else if (Array.isArray(raw.data?.ItemList)) base = { ...raw.data };
      else base = { ...raw, ItemList: [] };
    } else {
      base = { ItemList: [] };
    }

    const itemList = (Array.isArray(base.ItemList) ? base.ItemList : []).map((it, idx) => normalizeItem(it, idx));
    const itemIdList = itemList.map((it, idx) => itemIdListEntryForLan(it, idx));
    const tplAsset = toNum(base.TemplateAssetClockId, 0);
    const merged = {
      ...base,
      NameCn: String(base.NameCn ?? base.NameEn ?? "Untitled"),
      NameEn: String(base.NameEn ?? base.NameCn ?? "Untitled"),
      DescCn: String(base.DescCn ?? ""),
      DescEn: String(base.DescEn ?? ""),
      ClockId: toNum(base.ClockId, 0),
      ItemList: itemList,
      ItemIdList: itemIdList
    };
    if (tplAsset > 0) merged.TemplateAssetClockId = tplAsset;
    else delete merged.TemplateAssetClockId;
    if (merged.AppImageUrl === undefined && merged.AppPreviewImageUrl !== undefined) {
      merged.AppImageUrl = merged.AppPreviewImageUrl;
    }
    delete merged.AppPreviewImageUrl;
    return merged;
  }

  /** 解析 template/15、template/29 等资源包用的 ClockId：`ClockId` 为设备/未下发 0 时仍用复制的模板锚点加载内置文件。 */
  function resolveTemplate29PackClockId(cfg = state.config) {
    const pack = cfg && typeof cfg === "object" ? toNum(cfg.TemplateAssetClockId, 0) : 0;
    if (pack > 0) return pack;
    return cfg && typeof cfg === "object" ? toNum(cfg.ClockId, 0) : 0;
  }

  /**
   * 同时回写 ItemList[].item_id：固件不仅校验顶层 ItemIdList 数组，还会按位置读取每个 ItemList
   * 条目自身的 `item_id` 字段，两者均必须非空。
   */
  function syncItemIdList() {
    const ids = state.config.ItemList.map((it, idx) => itemIdListEntryForLan(it, idx));
    state.config.ItemIdList = ids;
    state.config.ItemList.forEach((it, idx) => {
      if (!it) return;
      const want = ids[idx];
      const cur = it.item_id;
      const curStr = cur === undefined || cur === null ? "" : String(cur);
      if (curStr.length === 0) it.item_id = want;
    });
  }

  /** UI 为简体中文时读取中文名；其余语言（含繁体、英语等）模板/表盘名称统一以英文为主。 */
  function isUiZhCnLocale() {
    return String(getLocaleCode() || "").toLowerCase() === "zh-cn";
  }

  /** 成对的中/英名称：仅 zh-CN 界面用中文优先，否则英文优先。 */
  function localizedDualName(nameCn, nameEn, fallback = "") {
    const cn = String(nameCn ?? "").trim();
    const en = String(nameEn ?? "").trim();
    if (isUiZhCnLocale()) return cn || en || fallback;
    return en || cn || fallback;
  }

  function getClockDisplayName(config) {
    if (!config) return t("ui.default.untitled");
    const fb = t("ui.default.untitled");
    return localizedDualName(config.NameCn, config.NameEn, fb);
  }

  function normalizeTemplateClassifyClockIds(rawIds) {
    const set = new Set();
    for (const v of Array.isArray(rawIds) ? rawIds : []) {
      const id = toNum(v, NaN);
      if (Number.isFinite(id) && id > 0) set.add(id);
    }
    return [...set];
  }

  function buildTemplateClassifyRowsByAvailableIds(availableTemplateIds) {
    const availableSet = new Set();
    for (const id of Array.isArray(availableTemplateIds) ? availableTemplateIds : []) {
      const normalized = toNum(id, NaN);
      if (Number.isFinite(normalized) && normalized > 0) availableSet.add(normalized);
    }

    const rows = [];
    const classifyList = Array.isArray(getTemplateClassifyData()?.ClassifyList) ? getTemplateClassifyData().ClassifyList : [];
    for (const row of classifyList) {
      const classifyId = toNum(row?.ClassifyId, NaN);
      if (!Number.isFinite(classifyId)) continue;
      const allClockIds = normalizeTemplateClassifyClockIds(row?.clockid);
      rows.push({
        ClassifyId: classifyId,
        ClassifyName: String(row?.ClassifyName || "").trim(),
        ClassifyNameEn: String(row?.ClassifyNameEn || "").trim(),
        clockid: allClockIds,
        availableIds: allClockIds.filter((id) => availableSet.has(id))
      });
    }
    return rows;
  }

  function getTemplateClassifyDisplayName(row) {
    const nameCn = String(row?.ClassifyName || "").trim();
    const nameEn = String(row?.ClassifyNameEn || "").trim();
    const fallbackId = toNum(row?.ClassifyId, 0);
    const fallback = fallbackId > 0 ? `Classify ${fallbackId}` : t("ui.default.untitled");
    return localizedDualName(nameCn, nameEn, fallback);
  }

  function getSelectedTemplateClassifyRow() {
    if (!templateState.classifyRows.length) return null;
    const selected = toNum(templateState.selectedClassifyId, NaN);
    if (Number.isFinite(selected)) {
      const row = templateState.classifyRows.find((item) => item.ClassifyId === selected);
      if (row) return row;
    }
    return templateState.classifyRows[0] || null;
  }

  function findTemplateClassifyMeta(classifyId) {
    const cid = toNum(classifyId, NaN);
    if (!Number.isFinite(cid)) return null;
    const pools = [
      templateState.classifyRows,
      pendingTemplateState.classifyRows,
      Array.isArray(getTemplateClassifyData()?.ClassifyList) ? getTemplateClassifyData().ClassifyList : []
    ];
    for (const list of pools) {
      const row = list.find((item) => Number(item?.ClassifyId) === cid);
      if (row) return row;
    }
    return null;
  }

  function refreshTemplateCategorySelectorUi() {
    syncTemplateDomRefs();
    const previousSelected = toNum(templateState.selectedClassifyId, NaN);
    if (dom.selectTemplateCategory) dom.selectTemplateCategory.innerHTML = "";
    if (dom.templateCategoryRail) dom.templateCategoryRail.innerHTML = "";

    if (!templateState.classifyRows.length) {
      if (dom.selectTemplateCategory) {
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = t("template.hint.empty");
        dom.selectTemplateCategory.appendChild(emptyOpt);
        dom.selectTemplateCategory.disabled = true;
      }
      if (dom.templateCategoryRail) {
        const empty = document.createElement("div");
        empty.className = "template-category-empty";
        empty.textContent = t("template.hint.empty");
        dom.templateCategoryRail.appendChild(empty);
      }
      templateState.selectedClassifyId = null;
      return;
    }

    const hasPrevious = templateState.classifyRows.some((row) => row.ClassifyId === previousSelected);
    templateState.selectedClassifyId = hasPrevious
      ? previousSelected
      : templateState.classifyRows[0].ClassifyId;

    for (const row of templateState.classifyRows) {
      const label = getTemplateClassifyDisplayName(row);
      const active = row.ClassifyId === templateState.selectedClassifyId;
      if (dom.selectTemplateCategory) {
        const opt = document.createElement("option");
        opt.value = String(row.ClassifyId);
        opt.textContent = `${label} (${row.availableIds.length})`;
        dom.selectTemplateCategory.appendChild(opt);
      }
      if (dom.templateCategoryRail) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "template-category-card";
        btn.classList.toggle("active", active);
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", String(active));
        btn.dataset.classifyId = String(row.ClassifyId);

        const firstId = toNum(row.availableIds?.[0], NaN);
        if (Number.isFinite(firstId)) {
          const img = document.createElement("img");
          img.alt = "";
          img.decoding = "async";
          img.loading = "lazy";
          img.src = `${TEMPLATE_PREVIEW_DIR_33}${firstId + 1}.png`;
          btn.appendChild(img);
        }

        const text = document.createElement("span");
        text.className = "template-category-card-text";
        text.textContent = label;
        const count = document.createElement("span");
        count.className = "template-category-card-count";
        count.textContent = String(row.availableIds.length);
        btn.append(text, count);
        btn.addEventListener("click", () => {
          void selectTemplateClassify(row.ClassifyId, { previewFirst: true });
        });
        dom.templateCategoryRail.appendChild(btn);
      }
    }

    if (dom.selectTemplateCategory) {
      dom.selectTemplateCategory.value = String(templateState.selectedClassifyId);
      dom.selectTemplateCategory.disabled = false;
    }
  }

  async function selectTemplateClassify(classifyId, opts = {}) {
    const nextClassifyId = toNum(classifyId, NaN);
    templateState.selectedClassifyId = Number.isFinite(nextClassifyId) ? nextClassifyId : null;
    if (dom.selectTemplateCategory) dom.selectTemplateCategory.value = String(templateState.selectedClassifyId ?? "");
    const row = getSelectedTemplateClassifyRow();
    const firstId = toNum(row?.availableIds?.[0], NaN);
    if (Number.isFinite(firstId) && opts.previewFirst) {
      templateState.activeClockId = firstId;
    } else if (row && !row.availableIds.some((id) => Number(id) === Number(templateState.activeClockId))) {
      templateState.activeClockId = null;
    }
    refreshTemplateCategorySelectorUi();
    refreshTemplateListUi();
    if (Number.isFinite(firstId) && opts.previewFirst) {
      await previewTemplateWatchface(firstId);
    }
  }

  function rebuildTemplateClassifyRows() {
    templateState.classifyRows = buildTemplateClassifyRowsByAvailableIds(templateState.ids);
    const selected = toNum(templateState.selectedClassifyId, NaN);
    const hasSelected = templateState.classifyRows.some((row) => row.ClassifyId === selected);
    if (!hasSelected) {
      templateState.selectedClassifyId = templateState.classifyRows[0]?.ClassifyId ?? null;
    }
    refreshTemplateCategorySelectorUi();
  }

  function normalizeTemplateNameMeta(raw, id) {
    const fallbackId = toNum(id, 0);
    return {
      NameCn: String(raw?.NameCn ?? "").trim(),
      NameEn: String(raw?.NameEn ?? "").trim(),
      ClockId: toNum(raw?.ClockId, fallbackId)
    };
  }

  function getTemplateListItemName(id) {
    const meta = templateState.metaById.get(id) || normalizeTemplateNameMeta(null, id);
    const nameCn = String(meta.NameCn || "").trim();
    const nameEn = String(meta.NameEn || "").trim();
    const fallbackClockId = toNum(meta.ClockId, toNum(id, 0));
    const fallback = fallbackClockId > 0
      ? `ClockId ${fallbackClockId}`
      : (toNum(id, 0) > 0 ? String(toNum(id, 0)) : t("ui.default.untitled"));
    return localizedDualName(nameCn, nameEn, fallback);
  }

  async function loadTemplateNameMetaByIds(ids, concurrency = TEMPLATE_NAME_SCAN_CONCURRENCY) {
    const idList = Array.isArray(ids) ? ids : [];
    const map = new Map();
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(idList.length || 1, toNum(concurrency, TEMPLATE_NAME_SCAN_CONCURRENCY)));
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push((async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          if (index >= idList.length) break;
          const id = toNum(idList[index], NaN);
          if (!Number.isFinite(id)) continue;
          let raw = null;
          try {
            raw = await loadTemplateConfigByClockId(id);
          } catch (e) {
            raw = null;
          }
          map.set(id, normalizeTemplateNameMeta(raw, id));
        }
      })());
    }
    await Promise.all(workers);
    return map;
  }

  function getLanDirtySnapshot() {
    try {
      syncItemIdList();
      const previewOverrides = Object.fromEntries(
        [...state.previewTextOverrides.entries()].sort((a, b) => a[0] - b[0])
      );
      const cfg = {
        ...state.config,
        ItemList: state.config.ItemList.map((item) => ({ ...item })),
        ItemIdList: [...state.config.ItemIdList]
      };
      return JSON.stringify({
        cfg,
        previewW: state.width,
        previewH: state.height,
        bgKey: state.backgroundName || "",
        previewOverrides
      });
    } catch {
      return "";
    }
  }

  function captureLanBaseline() {
    lanBaselineSignature = getLanDirtySnapshot();
    lanBaselineBgName = String(state.backgroundName || "");
    refreshLanActionButtons();
  }

  /** 用户是否在自上次 baseline 后换过 dial 底图（按 `state.backgroundName` 比对）。 */
  function isLanBackgroundDirtyAgainstBaseline() {
    return String(state.backgroundName || "") !== String(lanBaselineBgName || "");
  }

  /** 顶部下拉是否已选具体设备（`value=""` 占位符视为未选）。 */
  function isLanDeviceSelectedInUi() {
    if (isSimulatedDeviceMode()) return getSimulatedDeviceId() > 0;
    return Boolean(dom.selectLanDevice && String(dom.selectLanDevice.value || "").trim());
  }

  /** 是否可向真实 LAN 设备发 HTTP（仿真模式仅商店 API，不走设备 HTTP）。 */
  function hasLanDeviceHttpTarget() {
    if (isSimulatedDeviceMode()) return false;
    return Boolean(getLanTargetBase());
  }

  function refreshLanActionButtons() {
    const applyBtn = dom.btnLanApplyWatchfaceConfig;
    const createBtn = dom.btnLanCreateOnDevice;
    const showClockBtn = dom.btnLanShowCurrentClockOnDevice;
    const hasClockId = toNum(state.config?.ClockId, 0) > 0;
    const hasLanDevice = isLanDeviceSelectedInUi();
    if (sidebarBrowseMode === "template") {
      if (applyBtn) applyBtn.disabled = true;
      if (createBtn) createBtn.disabled = true;
      if (showClockBtn) showClockBtn.hidden = true;
      return;
    }
    if (!hasLanDevice) {
      if (applyBtn) applyBtn.disabled = true;
      if (createBtn) createBtn.disabled = true;
      if (showClockBtn) {
        showClockBtn.hidden = !hasClockId;
        showClockBtn.disabled = true;
      }
      return;
    }
    if (!hasLanDeviceHttpTarget()) {
      if (applyBtn) applyBtn.disabled = true;
      if (createBtn) createBtn.disabled = true;
      if (showClockBtn) {
        showClockBtn.hidden = !hasClockId;
        showClockBtn.disabled = true;
      }
      return;
    }
    const dirty = getLanDirtySnapshot() !== lanBaselineSignature;
    if (applyBtn) applyBtn.disabled = !hasClockId || !dirty;
    if (createBtn) createBtn.disabled = hasClockId;
    if (showClockBtn) {
      showClockBtn.hidden = !hasClockId;
      showClockBtn.disabled = false;
    }
  }

  function refreshSidebarBrowseChrome() {
    const templateTabActive = sidebarBrowseMode === "template";

    const main = dom.mainLayout;
    if (main) {
      main.classList.toggle("layout-mode-local", !templateTabActive);
      main.classList.toggle("layout-mode-template", templateTabActive);
    }

    dom.appModeLocal?.classList.toggle("app-mode-strip__btn-active", !templateTabActive);
    dom.appModeTemplate?.classList.toggle("app-mode-strip__btn-active", templateTabActive);
    dom.appModeLocal?.setAttribute("aria-selected", String(!templateTabActive));
    dom.appModeTemplate?.setAttribute("aria-selected", String(templateTabActive));

    if (dom.panelLocalShell) dom.panelLocalShell.hidden = templateTabActive;
    if (dom.panelTemplateShell) dom.panelTemplateShell.hidden = !templateTabActive;
    /* 模板/待下载页也需选择 LAN 设备以更新模板库 */
    if (dom.topbarShellLocalOnly) dom.topbarShellLocalOnly.hidden = false;

    dom.rightEditorPanel?.toggleAttribute("inert", templateTabActive);

    const hintEl = dom.browseTemplateToolbarHint;
    if (hintEl) {
      hintEl.hidden = !templateTabActive;
      if (templateTabActive) setNodeText(hintEl, t("browseTemplate.toolbarHint"));
    }

    const btnApply = dom.btnApplyTemplate;
    if (btnApply) {
      const idSel = pendingTemplateState.active
        ? toNum(pendingTemplateState.activeClockId, NaN)
        : toNum(templateState.activeClockId, NaN);
      btnApply.disabled =
        pendingTemplateState.active ||
        !templateTabActive ||
        !Number.isFinite(idSel) ||
        templateState.loading;
    }

    if (templateTabActive && pendingTemplateState.active && dom.browseTemplateToolbarHint) {
      setNodeText(dom.browseTemplateToolbarHint, t("template.pending.toolbarHint"));
    }

    refreshToolbarClockIdUi();
    refreshTemplateSyncUi();
  }

  function onLocalConfigEdited() {
    refreshLanActionButtons();
    scheduleWorkspaceAutosave();
    scheduleDeferredNamingPrompt();
  }

  function scheduleWorkspaceAutosave() {
    if (!activeLocalWatchfaceId) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      void flushPersistActiveWorkspace();
    }, 550);
  }

  function scheduleDeferredNamingPrompt() {
    window.clearTimeout(namingDebounceTimer);
    namingDebounceTimer = window.setTimeout(() => {
      void maybeOpenFirstEditNamingDialog();
    }, 480);
  }

  function finishLocalSaveNamedDialog(result) {
    try {
      dom.localSaveNamedDialog?.close();
    } catch (e) {
      /* ignore */
    }
    const fn = saveNamedDialogResolver;
    saveNamedDialogResolver = null;
    if (fn) fn(result);
  }

  function openLocalSaveNamedDialog({ mode, context }) {
    return new Promise((resolve) => {
      saveNamedDialogResolver = resolve;
      const blocking = mode === "blocking";
      const applyTpl = mode === "apply_template";
      const newWatchface = mode === "new_watchface";
      const duplicateWatchface = mode === "duplicate_watchface";
      const importWatchface = mode === "import_watchface";

      if (dom.localSaveNamedLater)
        dom.localSaveNamedLater.hidden =
          blocking || applyTpl || newWatchface || duplicateWatchface || importWatchface;
      if (dom.localSaveNamedDiscard) dom.localSaveNamedDiscard.hidden = !blocking;
      if (dom.localSaveNamedCancel)
        dom.localSaveNamedCancel.hidden =
          !(blocking || applyTpl || newWatchface || duplicateWatchface || importWatchface);

      if (blocking) {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleBlocking"));
        const bodyKey =
          context === "template"
            ? "localWatch.dialog.bodyBlockingTemplate"
            : context === "tab_template"
              ? "localWatch.dialog.bodyBlockingTabTemplate"
              : "localWatch.dialog.bodyBlockingLeave";
        setNodeText(dom.localSaveNamedBody, t(bodyKey));
      } else if (applyTpl) {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleApplyTemplate"));
        setNodeText(dom.localSaveNamedBody, t("localWatch.dialog.bodyApplyTemplate"));
      } else if (newWatchface) {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleNew"));
        setNodeText(dom.localSaveNamedBody, t("localWatch.dialog.bodyNew"));
      } else if (duplicateWatchface) {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleDuplicate"));
        const srcNm = context?.sourceName ? String(context.sourceName) : "";
        setNodeText(dom.localSaveNamedBody, t("localWatch.dialog.bodyDuplicate", { name: srcNm }));
      } else if (importWatchface) {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleImport"));
        setNodeText(dom.localSaveNamedBody, t("localWatch.dialog.bodyImport"));
      } else {
        setNodeText(dom.localSaveNamedTitle, t("localWatch.dialog.titleFirst"));
        setNodeText(dom.localSaveNamedBody, t("localWatch.dialog.bodyFirst"));
      }
      setNodeText(dom.localSaveNamedLabel, t("localWatch.dialog.nameLabel"));
      setNodeText(dom.localSaveNamedLater, t("localWatch.dialog.later"));
      setNodeText(dom.localSaveNamedDiscard, t("localWatch.dialog.discard"));
      setNodeText(dom.localSaveNamedCancel, t("lan.dialog.cancel"));
      setNodeText(
        dom.localSaveNamedSubmit,
        newWatchface
          ? t("localWatch.dialog.create")
          : duplicateWatchface
            ? t("localWatch.dialog.duplicateConfirm")
            : t("localWatch.dialog.save")
      );

      if (dom.localSaveNamedInput) {
        const preset =
          importWatchface && context?.defaultName
            ? String(context.defaultName)
            : newWatchface || duplicateWatchface
              ? ""
              : getClockDisplayName(state.config) || "";
        dom.localSaveNamedInput.value = preset;
      }
      dom.localSaveNamedDialog?.showModal();
      window.requestAnimationFrame(() => {
        dom.localSaveNamedInput?.focus();
        dom.localSaveNamedInput?.select?.();
      });
    });
  }

  async function maybeOpenFirstEditNamingDialog() {
    if (sidebarBrowseMode === "template") return;
    if (activeLocalWatchfaceId) return;
    if (namingPromptDismissed) return;
    if (!isWorkspaceDirtyVsBaseline()) return;
    if (dom.localSaveNamedDialog?.open) return;

    const r = await openLocalSaveNamedDialog({ mode: "first_edit" });
    if (r.action === "save") {
      const nm = String(r.name || "").trim();
      if (!nm) {
        alert(t("lan.err.emptyName"));
        return;
      }
      await persistNewNamedWatchface(nm);
    } else if (r.action === "later") {
      namingPromptDismissed = true;
    }
  }

  async function imageToDataUrlForPersist(img) {
    if (!img || !img.complete || img.naturalWidth <= 0) return null;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return c.toDataURL("image/jpeg", 0.9);
    } catch {
      return null;
    }
  }

  function persistImageCacheKey(img, name) {
    if (!img || !img.complete || img.naturalWidth <= 0) return "";
    const src = String(img.src || "");
    return `${name || ""}|${img.naturalWidth}x${img.naturalHeight}|${src.length}|${src.slice(-64)}`;
  }

  function invalidatePersistImageCache(slot) {
    if (slot === "bg" || slot === "appPreview") {
      persistImageCache[slot] = { key: "", dataUrl: null };
      return;
    }
    persistImageCache.bg = { key: "", dataUrl: null };
    persistImageCache.appPreview = { key: "", dataUrl: null };
  }

  async function cachedImageDataUrlForPersist(slot, img, name) {
    const key = persistImageCacheKey(img, name);
    if (!key) return null;
    const entry = persistImageCache[slot];
    if (entry.key === key && entry.dataUrl) return entry.dataUrl;
    const dataUrl = await imageToDataUrlForPersist(img);
    persistImageCache[slot] = { key, dataUrl };
    return dataUrl;
  }

  function pauseWatchfaceTick() {
    watchfaceTickPauseDepth += 1;
    if (watchfaceTickPauseDepth === 1 && state.tickHandle) {
      clearInterval(state.tickHandle);
      state.tickHandle = 0;
    }
  }

  function resumeWatchfaceTick() {
    if (watchfaceTickPauseDepth <= 0) return;
    watchfaceTickPauseDepth -= 1;
    if (watchfaceTickPauseDepth === 0 && !state.tickHandle) {
      state.tickHandle = setInterval(() => renderWatchface(), PREVIEW_TICK_MS);
    }
  }

  function wireResponsiveFileInput(input) {
    if (!input) return;
    const onActivate = () => pauseWatchfaceTick();
    const onDeactivate = () => resumeWatchfaceTick();
    input.addEventListener("pointerdown", onActivate, true);
    input.addEventListener("focus", onActivate, true);
    input.addEventListener("change", onDeactivate);
    input.addEventListener("blur", onDeactivate);
    input.addEventListener("cancel", onDeactivate);
  }

  async function loadBundledThumbDataUrl(packClockId) {
    try {
      const id = toNum(packClockId, 0);
      if (id <= 0) return "";
      const thumbUrl = withBase(`template/33/${id + 1}.png`);
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.decoding = "async";
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("thumb"));
        im.src = thumbUrl;
      });
      return (await imageToDataUrlForPersist(img)) || "";
    } catch {
      return "";
    }
  }

  /** When the user has no saved 「我的设计」, install the shipped preset once and make it active. */
  async function ensureBundledStarterWatchfaceIfLibraryEmpty() {
    if (listWatchfaces().length > 0) return;
    let raw;
    try {
      const res = await fetch(withBase("defaults/starter-watchface.json"), { cache: "force-cache" });
      if (!res.ok) return;
      raw = await res.json();
    } catch {
      return;
    }
    const packClock = toNum(raw?.ClockId, BUNDLED_STARTER_TEMPLATE_PACK_FALLBACK_ID);
    const nmCn = String(raw?.NameCn || "").trim();
    const nmEn = String(raw?.NameEn || "").trim();
    const rowName = nmCn || nmEn || "立体方块2";
    const bgData = await loadBundledThumbDataUrl(packClock);
    upsert({
      id: BUNDLED_STARTER_WATCHFACE_ID,
      name: rowName,
      updatedAt: Date.now(),
      config: raw,
      backgroundDataUrl: bgData,
      backgroundName: "",
      backgroundSourceLabel: "",
      width: EDITOR_CANVAS_WIDTH,
      height: EDITOR_CANVAS_HEIGHT,
      zoom: 55,
      previewOverrides: {},
      templateActiveClockId: null
    });
    setLastActiveId(BUNDLED_STARTER_WATCHFACE_ID);
    fontStore.log(t("log.bundledStarterSeeded", { name: rowName }));
  }

  async function flushPersistActiveWorkspace() {
    if (!activeLocalWatchfaceId) return;
    const existing = getWatchface(activeLocalWatchfaceId);
    const nm = String(
      getClockDisplayName(state.config) || existing?.name || t("ui.default.untitled")
    ).trim();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const bgUrl = await cachedImageDataUrlForPersist("bg", state.backgroundImage, state.backgroundName);
    const appPreviewUrl = await cachedImageDataUrlForPersist(
      "appPreview",
      state.appPreviewImage,
      state.appPreviewName
    );
    syncItemIdList();
    const previewOverrides = Object.fromEntries(state.previewTextOverrides);
    const rec = {
      id: activeLocalWatchfaceId,
      name: nm,
      updatedAt: Date.now(),
      config: JSON.parse(JSON.stringify(state.config)),
      backgroundDataUrl: bgUrl,
      backgroundName: state.backgroundName || "",
      backgroundSourceLabel: state.backgroundSourceLabel || "",
      appPreviewDataUrl: appPreviewUrl,
      appPreviewName: state.appPreviewName || "",
      appPreviewSourceLabel: state.appPreviewSourceLabel || "",
      width: state.width,
      height: state.height,
      zoom: state.zoom,
      previewOverrides,
      templateActiveClockId: templateState.activeClockId
    };
    try {
      upsert(rec);
      workspaceBaselineSig = getLanDirtySnapshot();
      if (String(existing?.name || "") !== nm) refreshLocalWatchfaceListUi();
    } catch (e) {
      alert(t("localWatch.errQuota", { message: errorToText(e) }));
    }
  }

  async function persistNewNamedWatchface(name, opts = {}) {
    const nm = String(name || "").trim();
    if (!nm) return;
    const tplAnchor = toNum(opts.assetPackClockId, 0);
    const curClock = toNum(state.config.ClockId, 0);
    const existingPack = toNum(state.config.TemplateAssetClockId, 0);
    if (tplAnchor > 0) {
      state.config.TemplateAssetClockId = tplAnchor;
    } else if (curClock > 0 && existingPack <= 0) {
      state.config.TemplateAssetClockId = curClock;
    }
    const id = newWatchfaceId();
    activeLocalWatchfaceId = id;
    state.config.ClockId = 0;
    state.config.NameCn = nm;
    state.config.NameEn = nm;
    dom.txtClockTitle.textContent = nm;
    refreshToolbarClockIdUi();
    rebuildItemEditor();
    await flushPersistActiveWorkspace();
    setLastActiveId(id);
    captureLanBaseline();
    syncWorkspaceBaseline();
    refreshLocalWatchfaceListUi();
    fontStore.log(t("localWatch.savedAs", { name: nm }));
  }

  async function activateSidebarTemplateBrowse() {
    if (sidebarBrowseMode === "template") return;

    syncTemplateDomRefs();
    const ok = await ensureWorkspaceHandledBeforeSwitch("tab_template");
    if (!ok) return;

    sidebarBrowseMode = "template";
    refreshSidebarBrowseChrome();

    const selectedClassify = getSelectedTemplateClassifyRow();
    const filtered = selectedClassify ? [...selectedClassify.availableIds] : [];

    if (!filtered.length) {
      templateState.activeClockId = null;
      refreshSidebarBrowseChrome();
      refreshTemplateListUi();
      return;
    }

    let idToPreview = toNum(templateState.activeClockId, NaN);
    const inList = filtered.some((x) => Number(x) === Number(idToPreview));

    if (!Number.isFinite(idToPreview) || !inList) {
      idToPreview = toNum(filtered[0], NaN);
    }

    await previewTemplateWatchface(idToPreview);
  }

  async function activateSidebarLocalEdit() {
    if (sidebarBrowseMode === "local") return;

    sidebarBrowseMode = "local";
    refreshSidebarBrowseChrome();

    templateState.activeClockId = null;
    refreshTemplateListUi();

    const idRaw = activeLocalWatchfaceId || getLastActiveId();
    const rec = idRaw ? getWatchface(idRaw) : null;

    if (rec && idRaw) {
      activeLocalWatchfaceId = String(idRaw);
      await restoreWorkspaceFromRecord(rec);
      namingPromptDismissed = true;
    } else {
      activeLocalWatchfaceId = "";
      clearBackgroundObjectUrl();
      state.backgroundImage = null;
      state.backgroundName = "";
      state.backgroundSourceLabel = "";
      if (dom.inputBgFile) dom.inputBgFile.value = "";
      refreshBackgroundSourceLabel();
      clearAppPreviewState();
      applyConfig(
        {
          ClockId: 0,
          NameCn: t("ui.default.untitled"),
          NameEn: "Untitled",
          ItemList: [createDefaultItem(0)]
        },
        t("source.init")
      );
      namingPromptDismissed = false;
      syncWorkspaceBaseline();
      captureLanBaseline();
    }

    refreshLocalWatchfaceListUi();
  }

  async function applyTemplateDraftToNamedLocalWatchface(prefTplIdOpt) {
    if (sidebarBrowseMode !== "template") return;
    const tplId = toNum(prefTplIdOpt ?? templateState.activeClockId, NaN);
    if (!Number.isFinite(tplId)) {
      alert(t("template.err.noneSelected"));
      return;
    }

    await previewTemplateWatchface(tplId);

    const r = await openLocalSaveNamedDialog({ mode: "apply_template" });
    if (r.action === "cancel" || r.action === "later") return;
    if (r.action !== "save") return;

    const nm = String(r.name || "").trim();
    if (!nm) {
      alert(t("lan.err.emptyName"));
      return;
    }

    templateState.activeClockId = null;
    sidebarBrowseMode = "local";
    refreshSidebarBrowseChrome();
    refreshTemplateListUi();

    await persistNewNamedWatchface(nm, { assetPackClockId: tplId });
    refreshLocalWatchfaceListUi();
    fontStore.log(t("browseTemplate.savedFromTemplate", { name: nm, templateId: tplId }));
  }

  async function ensureWorkspaceHandledBeforeSwitch(context) {
    window.clearTimeout(namingDebounceTimer);
    if (!isWorkspaceDirtyVsBaseline()) return true;
    if (activeLocalWatchfaceId) {
      await flushPersistActiveWorkspace();
      return true;
    }
    const r = await openLocalSaveNamedDialog({ mode: "blocking", context });
    if (r.action === "cancel") return false;
    if (r.action === "discard") {
      namingPromptDismissed = false;
      return true;
    }
    if (r.action === "later") return false;
    if (r.action === "save") {
      const nm = String(r.name || "").trim();
      if (!nm) {
        alert(t("lan.err.emptyName"));
        return false;
      }
      await persistNewNamedWatchface(nm);
      return true;
    }
    return false;
  }

  async function buildWatchfaceExportDeps(exportRecordId = "") {
    async function fetchPublicFileForExport(relPath) {
      const rel = String(relPath || "").replace(/^\/+/, "");
      if (!rel || rel.includes("..")) return null;
      try {
        const res = await fetch(withBase(rel), { cache: "no-store" });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const leaf = rel.split("/").pop() || rel;
        return { bytes, sourceLeaf: leaf };
      } catch {
        return null;
      }
    }

    async function fetchTemplateAssetForExport(relPrefix, baseName, extCandidates) {
      const baseDir = relPrefix.startsWith("http") ? relPrefix : withBase(relPrefix);
      const result = await loadFirstTemplateAsset(baseDir, baseName, extCandidates);
      const asset = result?.asset;
      if (!asset) return null;
      const sourceLeaf = asset.name || basename(String(result.path || ""));
      try {
        if (asset.sourceUrl) {
          const res = await fetch(asset.sourceUrl, { cache: "no-store" });
          if (res.ok) {
            return { bytes: new Uint8Array(await res.arrayBuffer()), sourceLeaf };
          }
        }
        if (asset.objectUrl) {
          const res = await fetch(asset.objectUrl);
          if (res.ok) {
            return { bytes: new Uint8Array(await res.arrayBuffer()), sourceLeaf };
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    async function fetchLiveItemAsset(itemKey) {
      if (String(exportRecordId) !== String(activeLocalWatchfaceId || "")) return null;
      const idx = Number(itemKey);
      if (!Number.isFinite(idx) || idx < 0) return null;
      const item = state.config?.ItemList?.[idx];
      if (!item) return null;
      const asset = getLocalDispAsset(item);
      if (!asset) return null;
      const sourceLeaf = asset.name || String(item.image_addr || "").trim();
      try {
        if (asset.sourceUrl) {
          const res = await fetch(asset.sourceUrl, { cache: "no-store" });
          if (res.ok) {
            return { bytes: new Uint8Array(await res.arrayBuffer()), sourceLeaf };
          }
        }
        if (asset.objectUrl) {
          const res = await fetch(asset.objectUrl);
          if (res.ok) {
            return { bytes: new Uint8Array(await res.arrayBuffer()), sourceLeaf };
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    return {
      isTemplateImageItem,
      getTemplateSlotByItem,
      itemKey: (_item, idx) => String(idx),
      bgExtCandidates: TEMPLATE_BG_EXT_CANDIDATES,
      previewExtCandidates: TEMPLATE_PREVIEW_EXT_CANDIDATES,
      imgExtCandidates: TEMPLATE_IMG_EXT_CANDIDATES,
      fetchPublicFile: fetchPublicFileForExport,
      fetchTemplateAsset: fetchTemplateAssetForExport,
      fetchLiveItemAsset,
      editorMeta: { build: APP_BUILD_NUMBER }
    };
  }

  async function exportLocalWatchfaceById(id) {
    if (!id) return;
    if (!isWatchfaceDirectoryExportSupported()) {
      alert(t("localWatch.export.unsupported"));
      return;
    }
    if (id === activeLocalWatchfaceId) {
      await flushPersistActiveWorkspace();
    }
    const rec = getWatchface(id);
    if (!rec) {
      alert(t("localWatch.export.missing"));
      return;
    }

    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {
      if (e?.name === "AbortError") return;
      alert(t("localWatch.export.failed", { message: errorToText(e) }));
      return;
    }

    try {
      const deps = await buildWatchfaceExportDeps(id);
      const { written, missing } = await exportWatchfaceToDirectory(rec, dirHandle, deps);
      const msg = missing.length
        ? t("localWatch.export.donePartial", { written: written.length, missing: missing.length })
        : t("localWatch.export.done", { count: written.length });
      alert(msg);
      fontStore.log(
        t("localWatch.export.log", {
          name: rec.name || id,
          written: written.length,
          missing: missing.length
        })
      );
      if (missing.length) {
        fontStore.log(t("localWatch.export.missingList", { list: missing.slice(0, 12).join(", ") }));
      }
    } catch (e) {
      alert(t("localWatch.export.failed", { message: errorToText(e) }));
      fontStore.log(t("localWatch.export.failed", { message: errorToText(e) }));
    }
  }

  function importWatchfaceErrorMessage(err) {
    const code = String(err?.message || err || "");
    if (code === "json_not_found") return t("localWatch.import.noJson");
    if (code === "missing_item_list") return t("localWatch.import.invalidJson", { message: "ItemList" });
    if (code === "invalid_json") return t("localWatch.import.invalidJson", { message: "JSON" });
    return t("localWatch.import.failed", { message: errorToText(err) });
  }

  async function loadImportedAssetLeaf(leaf, fileMap) {
    const name = basename(String(leaf || "").trim());
    if (!name) return null;
    const picked = resolveImportFileForLeaf(name, fileMap);
    if (picked) {
      try {
        return await loadLocalAssetFromFile(picked);
      } catch {
        return null;
      }
    }
    for (const rel of buildPublicAssetLookupPaths(name)) {
      try {
        return await loadLocalAssetFromUrl(withBase(rel), name);
      } catch {
        // try next path
      }
    }
    return null;
  }

  async function hydrateImportedWatchfaceAssets(config, fileMap) {
    const leaves = collectImportAssetLeaves(config);
    const missing = [];
    let loaded = 0;

    const bgLeaf = String(config?.DeviceImageUrl || "").trim();
    if (bgLeaf && !/^https?:\/\//i.test(bgLeaf)) {
      const asset = await loadImportedAssetLeaf(bgLeaf, fileMap);
      if (asset) {
        setBackgroundFromAsset(asset);
        state.backgroundName = asset.name || basename(bgLeaf);
        state.backgroundSourceLabel = asset.fromLocalPick
          ? t("ui.bg.localFileHint", { name: state.backgroundName })
          : String(asset.sourceUrl || state.backgroundName);
        if (state.config && typeof state.config === "object") {
          state.config.DeviceImageUrl = state.backgroundName;
        }
        loaded += 1;
      } else {
        missing.push(bgLeaf);
      }
    }

    const appLeaf = String(config?.AppImageUrl || "").trim();
    if (appLeaf && !/^https?:\/\//i.test(appLeaf)) {
      const asset = await loadImportedAssetLeaf(appLeaf, fileMap);
      if (asset) {
        setAppPreviewFromAsset(asset);
        state.appPreviewName = asset.name || basename(appLeaf);
        state.appPreviewSourceLabel = asset.fromLocalPick
          ? t("ui.bg.localFileHint", { name: state.appPreviewName })
          : String(asset.sourceUrl || state.appPreviewName);
        if (state.config && typeof state.config === "object") {
          state.config.AppImageUrl = state.appPreviewName;
        }
        loaded += 1;
      } else {
        missing.push(appLeaf);
      }
    }

    for (const item of state.config?.ItemList || []) {
      if (!isTemplateImageItem(item)) continue;
      const addr = String(item?.image_addr || "").trim();
      if (!addr || /^https?:\/\//i.test(addr)) continue;
      const asset = await loadImportedAssetLeaf(addr, fileMap);
      if (asset) {
        setLocalDispAsset(item, asset);
        item.image_addr = asset.name || basename(addr);
        loaded += 1;
      } else {
        missing.push(addr);
      }
    }

    refreshBackgroundSourceLabel();
    refreshAppPreviewSourceLabel();
    return { loaded, missing, total: leaves.length };
  }

  async function finalizeImportedWatchface(config, hydrateResult) {
    const defaultName = String(config?.NameCn || config?.NameEn || "").trim();
    const r = await openLocalSaveNamedDialog({
      mode: "import_watchface",
      context: { defaultName }
    });
    if (r.action !== "save") return false;
    const nm = String(r.name || defaultName || "").trim();
    if (!nm) {
      alert(t("lan.err.emptyName"));
      return false;
    }

    sidebarBrowseMode = "local";
    templateState.activeClockId = null;
    refreshSidebarBrowseChrome();
    refreshTemplateListUi();
    namingPromptDismissed = true;
    activeLocalWatchfaceId = "";

    state.config.NameCn = nm;
    state.config.NameEn = nm;
    dom.txtClockTitle.textContent = nm;
    refreshToolbarClockIdUi();

    await persistNewNamedWatchface(nm);
    rebuildItemEditor();
    renderWatchface();
    applyCanvasZoom();

    const { loaded, missing, total } = hydrateResult;
    const msg =
      missing.length > 0
        ? t("localWatch.import.done", { name: nm, loaded, missing: missing.length })
        : t("localWatch.import.doneAll", { name: nm, loaded });
    alert(msg);
    fontStore.log(t("localWatch.import.log", { name: nm, loaded, total: total || loaded }));
    if (missing.length) {
      fontStore.log(t("localWatch.import.missingList", { list: missing.slice(0, 12).join(", ") }));
    }
    return true;
  }

  async function importWatchfaceFromPayload({ jsonText, fileMap }) {
    let raw;
    try {
      raw = parseWatchfaceImportJson(jsonText);
    } catch (err) {
      alert(importWatchfaceErrorMessage(err));
      return;
    }

    const config = prepareConfigForLocalImport(raw);
    clearBackgroundObjectUrl();
    state.backgroundImage = null;
    state.backgroundName = "";
    state.backgroundSourceLabel = "";
    if (dom.inputBgFile) dom.inputBgFile.value = "";
    clearAppPreviewState();

    applyConfig(config, t("localWatch.importBtn"));
    const hydrateResult = await hydrateImportedWatchfaceAssets(config, fileMap);
    await finalizeImportedWatchface(config, hydrateResult);
    refreshLocalWatchfaceListUi();
  }

  async function importWatchfaceFromJsonFile(file) {
    if (!file) return;
    const jsonText = await file.text();
    await importWatchfaceFromPayload({ jsonText, fileMap: new Map() });
  }

  async function startImportWatchface() {
    if (sidebarBrowseMode === "template") return;
    const ok = await ensureWorkspaceHandledBeforeSwitch("import");
    if (!ok) return;

    if (dom.inputImportWatchfaceJson) {
      dom.inputImportWatchfaceJson.value = "";
      dom.inputImportWatchfaceJson.click();
      return;
    }

    alert(t("localWatch.import.unsupported"));
  }

  function refreshLocalWatchfaceListUi() {
    const ul = dom.localWatchfaceList;
    if (!ul) return;
    const rows = listWatchfaces();
    if (dom.localWatchHint) {
      dom.localWatchHint.textContent =
        rows.length === 0 ? t("localWatch.listEmpty") : t("localWatch.listHint");
    }
    ul.innerHTML = "";
    for (const row of rows) {
      const li = document.createElement("li");
      if (row.id === activeLocalWatchfaceId) li.classList.add("active");
      const main = document.createElement("div");
      main.className = "local-watch-row-main";
      const title = document.createElement("span");
      title.className = "template-id";
      title.textContent = row.name || row.id;
      main.append(title);
      main.addEventListener("click", () => {
        void loadLocalWatchfaceById(row.id);
      });
      const actions = document.createElement("div");
      actions.className = "local-watch-row-actions";
      const exp = document.createElement("button");
      exp.type = "button";
      exp.className = "btn-ghost btn-compact local-watch-export";
      exp.setAttribute("aria-label", t("localWatch.exportAria"));
      exp.textContent = t("localWatch.exportBtn");
      exp.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void exportLocalWatchfaceById(row.id);
      });
      actions.appendChild(exp);
      const clockIdOnRecord = toNum(row.config?.ClockId, 0);
      if (clockIdOnRecord > 0) {
        const dup = document.createElement("button");
        dup.type = "button";
        dup.className = "btn-ghost btn-compact local-watch-duplicate";
        dup.setAttribute("aria-label", t("localWatch.duplicateAria"));
        dup.textContent = t("localWatch.duplicateBtn");
        dup.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void duplicateLocalWatchfaceFromRow(row.id);
        });
        actions.appendChild(dup);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-ghost btn-compact local-watch-delete";
      del.setAttribute("aria-label", t("localWatch.deleteAria"));
      del.textContent = "×";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void deleteLocalWatchface(row.id);
      });
      actions.appendChild(del);
      li.append(main, actions);
      ul.appendChild(li);
    }
  }

  async function restoreWorkspaceFromRecord(rec) {
    applyConfig(rec.config, t("localWatch.loaded", { name: rec.name }));
    let packId = resolveTemplate29PackClockId(state.config);
    if (packId <= 0 && rec.templateActiveClockId != null) {
      const fid = toNum(rec.templateActiveClockId, 0);
      if (fid > 0) {
        state.config.TemplateAssetClockId = fid;
        packId = fid;
      }
    }
    state.previewTextOverrides = new Map(Object.entries(rec.previewOverrides || {}));
    syncEditorCanvasDimensions();
    state.zoom = clamp(toNum(rec.zoom, 55), 20, 220);
    if (dom.inputZoom) dom.inputZoom.value = String(state.zoom);
    if (dom.txtZoom) dom.txtZoom.textContent = `${Math.round(state.zoom)}%`;
    templateState.activeClockId =
      rec.templateActiveClockId != null ? rec.templateActiveClockId : null;
    refreshTemplateListUi();

    if (rec.backgroundDataUrl) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            clearBackgroundObjectUrl();
            state.backgroundImage = img;
            state.backgroundName = rec.backgroundName || "";
            state.backgroundSourceLabel = rec.backgroundSourceLabel || "";
            resolve();
          };
          img.onerror = () => reject(new Error("bg"));
          img.src = rec.backgroundDataUrl;
        });
      } catch {
        clearBackgroundObjectUrl();
        state.backgroundImage = null;
        state.backgroundName = "";
        state.backgroundSourceLabel = "";
      }
    } else {
      clearBackgroundObjectUrl();
      state.backgroundImage = null;
      state.backgroundName = "";
      state.backgroundSourceLabel = "";
    }
    refreshBackgroundSourceLabel();

    if (rec.appPreviewDataUrl) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            clearAppPreviewObjectUrl();
            state.appPreviewImage = img;
            state.appPreviewName = rec.appPreviewName || "";
            state.appPreviewSourceLabel = rec.appPreviewSourceLabel || "";
            resolve();
          };
          img.onerror = () => reject(new Error("appPreview"));
          img.src = rec.appPreviewDataUrl;
        });
      } catch {
        clearAppPreviewState();
      }
    } else {
      clearAppPreviewObjectUrl();
      state.appPreviewImage = null;
      state.appPreviewName = "";
      state.appPreviewSourceLabel = rec.appPreviewSourceLabel || "";
      if (dom.inputAppPreviewFile) dom.inputAppPreviewFile.value = "";
      const previewUrl = String(state.config?.AppImageUrl || "").trim();
      if (!state.appPreviewSourceLabel && previewUrl) {
        state.appPreviewSourceLabel = previewUrl;
      }
    }
    refreshAppPreviewSourceLabel();

    if (packId > 0) {
      const token = ++templateState.loadToken;
      await applyTemplateImageAssetsByClockId(packId, token);
      if (!rec.backgroundDataUrl && !state.backgroundImage) {
        const bgResult = await loadTemplateBackgroundByClockId(packId);
        if (token === templateState.loadToken && bgResult?.asset) {
          setBackgroundFromAsset(bgResult.asset);
          state.backgroundSourceLabel = bgResult.path
            ? absoluteUrlFromResolvedPath(String(bgResult.path).trim())
            : "";
          refreshBackgroundSourceLabel();
        } else if (bgResult?.asset) {
          releaseStandaloneAsset(bgResult.asset);
        }
      }
      if (!rec.appPreviewDataUrl && !state.appPreviewImage) {
        const previewResult = await loadTemplateAppPreviewByClockId(packId);
        if (token === templateState.loadToken && previewResult?.asset) {
          setAppPreviewFromAsset(previewResult.asset);
          const rel = String(previewResult.path || "").trim();
          state.appPreviewSourceLabel = rel ? absoluteUrlFromResolvedPath(rel) : "";
          if (state.config && typeof state.config === "object") {
            state.config.AppImageUrl = previewResult.asset.name || `${packId + 1}.png`;
          }
          refreshAppPreviewSourceLabel();
        } else if (previewResult?.asset) {
          releaseStandaloneAsset(previewResult.asset);
        }
      }
    }

    rebuildItemEditor();
    renderWatchface();
    applyCanvasZoom();
    captureLanBaseline();
    syncWorkspaceBaseline();
  }

  async function loadLocalWatchfaceById(id) {
    if (!id) return;
    const ok = await ensureWorkspaceHandledBeforeSwitch("pick_other");
    if (!ok) return;
    const rec = getWatchface(id);
    if (!rec) return;
    activeLocalWatchfaceId = id;
    setLastActiveId(id);
    await restoreWorkspaceFromRecord(rec);
    namingPromptDismissed = true;
    refreshLocalWatchfaceListUi();
  }

  async function deleteLocalWatchface(id) {
    if (!id) return;
    if (!confirm(t("localWatch.confirmDelete"))) return;
    removeWatchface(id);
    if (getLastActiveId() === id) setLastActiveId("");
    if (activeLocalWatchfaceId === id) {
      activeLocalWatchfaceId = "";
      templateState.activeClockId = null;
      refreshTemplateListUi();
      clearBackgroundObjectUrl();
      state.backgroundImage = null;
      state.backgroundName = "";
      state.backgroundSourceLabel = "";
      if (dom.inputBgFile) dom.inputBgFile.value = "";
      refreshBackgroundSourceLabel();
      clearAppPreviewState();
      applyConfig(
        {
          ClockId: 0,
          NameCn: t("ui.default.untitled"),
          NameEn: "Untitled",
          ItemList: [createDefaultItem(0)]
        },
        t("localWatch.deletedReset")
      );
      namingPromptDismissed = false;
      syncWorkspaceBaseline();
    }
    refreshLocalWatchfaceListUi();
  }

  async function duplicateLocalWatchfaceFromRow(sourceId) {
    if (!sourceId) return;
    const src = getWatchface(sourceId);
    if (!src) return;
    if (toNum(src.config?.ClockId, 0) <= 0) return;

    const ok = await ensureWorkspaceHandledBeforeSwitch("duplicate");
    if (!ok) return;

    const sourceLabel = String(src.name || getClockDisplayName(src.config) || "").trim() || sourceId;
    const r = await openLocalSaveNamedDialog({
      mode: "duplicate_watchface",
      context: { sourceName: sourceLabel }
    });
    if (r.action !== "save") return;

    const nm = String(r.name || "").trim();
    if (!nm) {
      alert(t("lan.err.emptyName"));
      return;
    }

    const newId = newWatchfaceId();
    const newConfig = JSON.parse(JSON.stringify(src.config));
    newConfig.ClockId = 0;
    newConfig.NameCn = nm;
    newConfig.NameEn = nm;

    const rec = {
      id: newId,
      name: nm,
      updatedAt: Date.now(),
      config: newConfig,
      backgroundDataUrl: src.backgroundDataUrl || "",
      backgroundName: src.backgroundName || "",
      backgroundSourceLabel: src.backgroundSourceLabel || "",
      appPreviewDataUrl: src.appPreviewDataUrl || "",
      appPreviewName: src.appPreviewName || "",
      appPreviewSourceLabel: src.appPreviewSourceLabel || "",
      width: EDITOR_CANVAS_WIDTH,
      height: EDITOR_CANVAS_HEIGHT,
      zoom: src.zoom ?? 55,
      previewOverrides: src.previewOverrides ? JSON.parse(JSON.stringify(src.previewOverrides)) : {},
      templateActiveClockId: src.templateActiveClockId != null ? src.templateActiveClockId : null
    };
    upsert(rec);
    activeLocalWatchfaceId = newId;
    setLastActiveId(newId);
    await restoreWorkspaceFromRecord(rec);
    namingPromptDismissed = true;
    refreshLocalWatchfaceListUi();
    fontStore.log(t("localWatch.duplicatedAs", { name: nm }));
  }

  async function startNewBlankWatchface() {
    if (sidebarBrowseMode === "template") return;
    const ok = await ensureWorkspaceHandledBeforeSwitch("new");
    if (!ok) return;

    const r = await openLocalSaveNamedDialog({ mode: "new_watchface" });
    if (r.action !== "save") return;

    const nm = String(r.name || "").trim();
    if (!nm) {
      alert(t("lan.err.emptyName"));
      return;
    }

    namingPromptDismissed = true;
    activeLocalWatchfaceId = "";
    templateState.activeClockId = null;
    refreshTemplateListUi();
    clearBackgroundObjectUrl();
    state.backgroundImage = null;
    state.backgroundName = "";
    state.backgroundSourceLabel = "";
    if (dom.inputBgFile) dom.inputBgFile.value = "";
    refreshBackgroundSourceLabel();
    clearAppPreviewState();
    applyConfig(
      {
        ClockId: 0,
        NameCn: t("ui.default.untitled"),
        NameEn: "Untitled",
        ItemList: [createDefaultItem(0)]
      },
      t("localWatch.newBlank")
    );

    await persistNewNamedWatchface(nm);
    refreshLocalWatchfaceListUi();
  }

  function wireLocalWatchDialogs() {
    dom.localSaveNamedLater?.addEventListener("click", () => {
      finishLocalSaveNamedDialog({ action: "later" });
    });
    dom.localSaveNamedDiscard?.addEventListener("click", () => {
      finishLocalSaveNamedDialog({ action: "discard" });
    });
    dom.localSaveNamedCancel?.addEventListener("click", () => {
      finishLocalSaveNamedDialog({ action: "cancel" });
    });
    dom.localSaveNamedSubmit?.addEventListener("click", () => {
      const nm = String(dom.localSaveNamedInput?.value || "").trim();
      if (!nm) {
        alert(t("lan.err.emptyName"));
        return;
      }
      finishLocalSaveNamedDialog({ action: "save", name: nm });
    });
    dom.localSaveNamedDialog?.addEventListener("cancel", (e) => {
      e.preventDefault();
      finishLocalSaveNamedDialog({ action: "cancel" });
    });
  }

  let lanDeviceRowsById = new Map();

  function getLanTargetBase() {
    try {
      const deviceBase = localStorage.getItem("divoom_lan_device_base")?.trim();
      if (deviceBase) return deviceBase;
      return localStorage.getItem("divoom_lan_direct_base")?.trim() || "";
    } catch {
      return "";
    }
  }

  function resolveSameLanDeviceListUrl() {
    if (import.meta.env.DEV) {
      return `${location.origin}/divoom-cloud-proxy/Device/ReturnSameLANDevice`;
    }
    if (location.protocol === "file:") {
      return "https://app.divoom-gz.com/Device/ReturnSameLANDevice";
    }
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `${location.origin}/divoom-cloud-proxy/Device/ReturnSameLANDevice`;
    }
    return "https://app.divoom-gz.com/Device/ReturnSameLANDevice";
  }

  function shouldUseLanProxyTunnel() {
    if (import.meta.env.DEV) return true;
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return location.port === "4173";
  }

  function buildLanFetchOptions(init = {}) {
    const headers = new Headers(init.headers || {});
    const base = getLanTargetBase();
    if (shouldUseLanProxyTunnel() && base) {
      headers.set("X-Divoom-Lan-Target", base.replace(/\/$/, ""));
    }
    return { ...init, headers };
  }

  function resolveDivoomUrl(apiPath) {
    const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    const base = getLanTargetBase();
    if (shouldUseLanProxyTunnel() && base) {
      return `/divoom-proxy${p}`;
    }
    if (base && import.meta.env.PROD) {
      return `${base.replace(/\/$/, "")}${p}`;
    }
    return `/divoom-proxy${p}`;
  }

  function resolveSelectedLanDeviceId() {
    if (isSimulatedDeviceMode()) return getSimulatedDeviceId();
    const id = dom.selectLanDevice?.value;
    if (!id) return 0;
    const row = lanDeviceRowsById.get(String(id));
    return row?.DeviceId ?? 0;
  }

  /** 表盘商店 API 用 DeviceId（来自 LAN 选择或本地记录，不要求设备 HTTP 可达）。 */
  function resolveStoreApiDeviceId() {
    if (isSimulatedDeviceMode()) return getSimulatedDeviceId();
    const fromUi = resolveSelectedLanDeviceId();
    if (fromUi > 0) return fromUi;
    try {
      const saved = Number(localStorage.getItem("divoom_lan_selected_device_id"));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {
      /* ignore */
    }
    return Number(TEMPLATE_CLASSIFY_FALLBACK.DeviceId) || 0;
  }

  const divoomStoreJson = createDivoomChinaStoreJson(resolveStoreApiDeviceId);

  async function divoomJson(command, payload = {}) {
    const envelope = buildDivoomLanEnvelope(command, payload, resolveSelectedLanDeviceId);
    if (!envelope.DeviceId) {
      throw new Error(t("lan.err.noDeviceId"));
    }
    const url = resolveDivoomUrl("/divoom_api");
    const body = JSON.stringify(envelope);
    let res;
    try {
      res = await fetch(url, buildLanFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body
      }));
    } catch (e) {
      throw new Error(t("lan.err.network", { message: errorToText(e) }));
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      throw new Error(t("lan.err.http", { status: res.status, text: text.slice(0, 240) }));
    }
    if (data && data.ReturnCode !== undefined && Number(data.ReturnCode) !== 0) {
      throw new Error(String(data.ReturnMessage || t("lan.err.returnCode", { code: data.ReturnCode })));
    }
    return data;
  }

  const templateSyncState = {
    scanning: false,
    message: "",
    error: ""
  };

  const pendingTemplateState = {
    active: false,
    scanning: false,
    downloading: false,
    error: "",
    scanMessage: "",
    classifyRows: [],
    selectedClassifyId: null,
    activeClockId: null,
    catalogSource: "",
    savedAt: ""
  };

  function formatPendingCacheSavedAt(isoText) {
    const raw = String(isoText || "").trim();
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    try {
      return d.toLocaleString(getLocaleCode());
    } catch {
      return d.toISOString();
    }
  }

  function savePendingTemplateCacheNow() {
    savePendingTemplateCacheToStorage({
      classifyRows: pendingTemplateState.classifyRows,
      selectedClassifyId: pendingTemplateState.selectedClassifyId,
      activeClockId: pendingTemplateState.activeClockId,
      catalogSource: pendingTemplateState.catalogSource
    });
    refreshViewPendingButtonUi();
  }

  async function restorePendingTemplateFromStorage() {
    const cached = loadPendingTemplateCacheFromStorage();
    if (!cached) return false;
    const { classifyRows } = await reconcilePendingClassifyRows(
      cached.classifyRows,
      loadTemplateConfigByClockId
    );
    if (!classifyRows.length) {
      savePendingTemplateCacheToStorage({ classifyRows: [] });
      pendingTemplateState.classifyRows = [];
      pendingTemplateState.savedAt = "";
      return false;
    }
    pendingTemplateState.classifyRows = classifyRows;
    pendingTemplateState.catalogSource = cached.catalogSource || "";
    pendingTemplateState.savedAt = cached.savedAt || "";
    pendingTemplateState.error = "";
    const prevSel = toNum(cached.selectedClassifyId, NaN);
    pendingTemplateState.selectedClassifyId = classifyRows.some((r) => r.ClassifyId === prevSel)
      ? prevSel
      : (classifyRows[0]?.ClassifyId ?? null);
    const prevActive = toNum(cached.activeClockId, NaN);
    pendingTemplateState.activeClockId = Number.isFinite(prevActive) ? prevActive : null;
    savePendingTemplateCacheNow();
    return true;
  }

  function refreshViewPendingButtonUi() {
    syncTemplateDomRefs();
    const btn = dom.btnViewPendingTemplates;
    if (!btn) return;
    const count = countPendingTemplateItems(pendingTemplateState.classifyRows);
    btn.hidden = pendingTemplateState.active || count <= 0;
    const busy =
      templateSyncState.scanning || pendingTemplateState.scanning || pendingTemplateState.downloading;
    btn.disabled = busy;
    setNodeText(btn, t("template.btn.viewPending", { count }));
    btn.title = t("template.btn.viewPendingTitle");
  }

  function countClassifyCatalogClockIds(data) {
    return (Array.isArray(data?.ClassifyList) ? data.ClassifyList : []).reduce(
      (n, row) => n + normalizeTemplateClassifyClockIds(row?.clockid).length,
      0
    );
  }

  async function enrichTemplateClassifyNamesFromStore(catalog) {
    if (!catalog || !classifyCatalogNeedsNameEnrichment(catalog)) return catalog;
    if (!resolveStoreApiDeviceId()) return catalog;
    try {
      const nameIndex = await fetchBilingualClassifyNameIndex(divoomStoreJson);
      return enrichClassifyCatalogNames(catalog, nameIndex);
    } catch {
      return catalog;
    }
  }

  async function loadTemplateClassifyCache() {
    try {
      const data = await fetchJson(TEMPLATE_CLASSIFY_CACHE_PATH);
      let merged = mergeClassifyCatalogSnapshots(TEMPLATE_CLASSIFY_FALLBACK, data);
      merged = await enrichTemplateClassifyNamesFromStore(merged);
      setTemplateClassifyDataRuntime(merged);
      const shouldRewriteDisk =
        classifyCatalogNeedsNameEnrichment(data) ||
        countClassifyCatalogClockIds(data) <
          countClassifyCatalogClockIds(TEMPLATE_CLASSIFY_FALLBACK) * 0.9;
      if (shouldRewriteDisk) {
        try {
          if (await isDevSyncApiAvailable()) {
            await saveClassifyCacheViaApi(merged);
          }
        } catch {
          /* 非 dev 或写入失败时仍保留内存中的合并结果 */
        }
      }
    } catch {
      /* 使用内置 TEMPLATE_CLASSIFY_FALLBACK */
    }
  }

  function setTemplateSyncStatusText(text, tone = "") {
    syncTemplateDomRefs();
    const el = dom.templateSyncStatus;
    if (!el) return;
    const msg = String(text || "").trim();
    el.hidden = !msg;
    el.textContent = msg;
    el.classList.remove("is-error", "is-ok");
    if (tone === "error") el.classList.add("is-error");
    if (tone === "ok") el.classList.add("is-ok");
  }

  function refreshTemplateSyncUi() {
    syncTemplateDomRefs();
    const btn = dom.btnSyncTemplates;
    if (!btn) return;
    btn.hidden = pendingTemplateState.active;
    btn.title = t("template.btn.syncTitle");
    setNodeText(btn, t("template.btn.sync"));
    const hasStoreDeviceId = resolveStoreApiDeviceId() > 0;
    const busy = templateSyncState.scanning || pendingTemplateState.scanning || pendingTemplateState.downloading;
    btn.disabled = busy || !hasStoreDeviceId;
    refreshViewPendingButtonUi();
    if (templateSyncState.scanning || pendingTemplateState.scanning) {
      setTemplateSyncStatusText(
        t("template.sync.scanning", { message: templateSyncState.message || pendingTemplateState.scanMessage || "…" })
      );
    } else if (templateSyncState.error) {
      setTemplateSyncStatusText(templateSyncState.error, "error");
    } else if (!pendingTemplateState.active) {
      setTemplateSyncStatusText("");
    }
    refreshFontSyncButtonUi();
    refreshDispSyncButtonUi();
  }

  function setTemplatePendingPanelVisible(on) {
    syncTemplateDomRefs();
    pendingTemplateState.active = Boolean(on);
    if (dom.templateBrowseCard) dom.templateBrowseCard.hidden = on;
    if (dom.templatePendingCard) dom.templatePendingCard.hidden = !on;
    if (dom.btnApplyTemplate) dom.btnApplyTemplate.hidden = on;
    refreshTemplateSyncUi();
    refreshSidebarBrowseChrome();
  }

  function getSelectedPendingClassifyRow() {
    if (!pendingTemplateState.classifyRows.length) return null;
    const selected = toNum(pendingTemplateState.selectedClassifyId, NaN);
    if (Number.isFinite(selected)) {
      const row = pendingTemplateState.classifyRows.find((item) => item.ClassifyId === selected);
      if (row) return row;
    }
    return pendingTemplateState.classifyRows[0] || null;
  }

  function getPendingItemByClockId(clockId) {
    const id = toNum(clockId, NaN);
    if (!Number.isFinite(id)) return null;
    for (const row of pendingTemplateState.classifyRows) {
      for (const item of row.items || []) {
        if (Number(item.clockId) === id) return item;
      }
    }
    return null;
  }

  function refreshPendingTemplateCategoryUi() {
    syncTemplateDomRefs();
    const rail = dom.templatePendingCategoryRail;
    if (!rail) return;
    rail.innerHTML = "";
    if (!pendingTemplateState.classifyRows.length) {
      const empty = document.createElement("div");
      empty.className = "template-category-empty";
      empty.textContent = t("template.pending.empty");
      rail.appendChild(empty);
      pendingTemplateState.selectedClassifyId = null;
      return;
    }
    const prev = toNum(pendingTemplateState.selectedClassifyId, NaN);
    const hasPrev = pendingTemplateState.classifyRows.some((r) => r.ClassifyId === prev);
    pendingTemplateState.selectedClassifyId = hasPrev
      ? prev
      : pendingTemplateState.classifyRows[0].ClassifyId;

    for (const row of pendingTemplateState.classifyRows) {
      const pendingCount = (row.items || []).filter((it) => it.status !== "installed").length;
      const label = localizedDualName(row.ClassifyName, row.ClassifyNameEn, `Classify ${row.ClassifyId}`);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "template-category-chip";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(row.ClassifyId === pendingTemplateState.selectedClassifyId));
      if (row.ClassifyId === pendingTemplateState.selectedClassifyId) btn.classList.add("active");
      btn.textContent = `${label} (${pendingCount})`;
      btn.addEventListener("click", () => {
        pendingTemplateState.selectedClassifyId = row.ClassifyId;
        savePendingTemplateCacheNow();
        refreshPendingTemplateCategoryUi();
        refreshPendingTemplateListUi();
      });
      rail.appendChild(btn);
    }
  }

  function pendingReasonLabel(reason) {
    if (reason === "outdated") return t("template.pending.reasonOutdated");
    return t("template.pending.reasonMissing");
  }

  function refreshPendingTemplateListUi() {
    syncTemplateDomRefs();
    const list = dom.templatePendingList;
    const hint = dom.templatePendingHint;
    if (!list || !hint) return;

    const row = getSelectedPendingClassifyRow();
    const items = row ? (row.items || []).filter((it) => it.status !== "installed") : [];

    list.innerHTML = "";
    if (pendingTemplateState.scanning) {
      hint.textContent = t("template.pending.scanning", {
        message: pendingTemplateState.scanMessage || "…"
      });
      const li = document.createElement("li");
      li.className = "template-list-empty";
      li.textContent = t("template.hint.loading");
      list.appendChild(li);
      return;
    }
    if (pendingTemplateState.error) {
      hint.textContent = t("template.pending.scanFailed", { message: pendingTemplateState.error });
      return;
    }
    if (!items.length) {
      hint.textContent = row ? t("template.pending.categoryEmpty") : t("template.pending.empty");
      const li = document.createElement("li");
      li.className = "template-list-empty";
      li.textContent = t("template.pending.empty");
      list.appendChild(li);
      return;
    }

    const savedLabel = formatPendingCacheSavedAt(pendingTemplateState.savedAt);
    hint.textContent = savedLabel
      ? t("template.pending.restored", { time: savedLabel })
      : t("template.pending.hint", { count: items.length });

    for (const item of items) {
      const id = Number(item.clockId);
      const li = document.createElement("li");
      if (pendingTemplateState.activeClockId === id) li.classList.add("active");
      if (item.status === "installed") li.classList.add("template-pending-installed");

      const rowEl = document.createElement("div");
      rowEl.className = "template-row-thumb";

      const img = document.createElement("img");
      img.className = "template-thumb-preview";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      if (item.imagePixelId) {
        img.src = resolveCdnFetchUrl(item.imagePixelId, { useProxy: true, origin: location.origin });
      } else {
        img.src = `${TEMPLATE_PREVIEW_DIR_33}${id + 1}.png`;
      }
      img.onerror = () => {
        img.src = `${TEMPLATE_PREVIEW_DIR_33}${id + 1}.png`;
      };

      const textWrap = document.createElement("div");
      textWrap.className = "template-thumb-text";
      const nameSpan = document.createElement("span");
      nameSpan.className = "template-id";
      nameSpan.textContent = item.clockName || `Clock ${id}`;
      const sub = document.createElement("span");
      sub.className = "template-thumb-sub";
      sub.textContent = t("template.item.file", { id });
      textWrap.append(nameSpan, sub);
      rowEl.append(img, textWrap);

      const actions = document.createElement("div");
      actions.className = "template-pending-actions";

      const badge = document.createElement("span");
      badge.className = `template-pending-badge is-${item.reason === "outdated" ? "outdated" : "missing"}`;
      badge.textContent = pendingReasonLabel(item.reason);

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "btn-primary btn-download-template";
      dlBtn.textContent = t("template.pending.download");
      const installed = item.status === "installed";
      const busy = pendingTemplateState.downloading;
      dlBtn.disabled = installed || busy;
      if (installed) dlBtn.textContent = t("template.pending.installed");

      dlBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void downloadPendingTemplateItem(id);
      });

      actions.append(badge, dlBtn);
      li.append(rowEl, actions);

      rowEl.addEventListener("click", () => {
        pendingTemplateState.activeClockId = id;
        savePendingTemplateCacheNow();
        refreshPendingTemplateListUi();
        void previewPendingTemplateIfAvailable(id);
      });

      list.appendChild(li);
    }
    refreshSidebarBrowseChrome();
  }

  async function previewPendingTemplateIfAvailable(clockId) {
    const id = toNum(clockId, NaN);
    if (!Number.isFinite(id)) return;
    try {
      const raw = await loadTemplateConfigByClockId(id);
      if (raw) await previewTemplateWatchface(id);
      else if (dom.browseTemplateToolbarHint) {
        setNodeText(dom.browseTemplateToolbarHint, t("template.pending.previewNeedDownload"));
      }
    } catch {
      /* ignore */
    }
  }

  async function loadClassifyCacheJsonForSync() {
    try {
      return await fetchJson(TEMPLATE_CLASSIFY_CACHE_PATH);
    } catch {
      return null;
    }
  }

  function openTemplateDownloadProgressDialog(titleText) {
    syncTemplateDomRefs();
    if (!dom.templateDownloadDialog) return;
    if (dom.templateDownloadTitle) setNodeText(dom.templateDownloadTitle, titleText);
    if (dom.templateDownloadProgress) dom.templateDownloadProgress.value = 0;
    if (dom.templateDownloadStatus) dom.templateDownloadStatus.textContent = "";
    if (typeof dom.templateDownloadDialog.showModal === "function") {
      dom.templateDownloadDialog.showModal();
    }
  }

  function updateTemplateDownloadProgressDialog(percent, message) {
    if (dom.templateDownloadProgress) {
      dom.templateDownloadProgress.value = Math.max(0, Math.min(100, Number(percent) || 0));
    }
    if (dom.templateDownloadStatus) {
      dom.templateDownloadStatus.textContent = String(message || "");
    }
  }

  function closeTemplateDownloadProgressDialog() {
    dom.templateDownloadDialog?.close?.();
  }

  async function downloadPendingTemplateItem(clockId) {
    const id = toNum(clockId, NaN);
    if (!Number.isFinite(id) || pendingTemplateState.downloading) return;
    const item = getPendingItemByClockId(id);
    if (!item || item.status === "installed") return;

    if (!isLanDeviceSelectedInUi()) {
      alert(t("template.sync.needDeviceId"));
      return;
    }
    if (!isSimulatedDeviceMode() && !getLanTargetBase()) {
      alert(t("template.sync.needDevice"));
      return;
    }
    const apiOk = await isDevSyncApiAvailable();
    if (!apiOk) {
      alert(t("template.sync.needDevServer"));
      return;
    }

    pendingTemplateState.downloading = true;
    refreshPendingTemplateListUi();
    refreshTemplateSyncUi();

    const title = item.clockName || t("template.item.file", { id });
    openTemplateDownloadProgressDialog(t("template.pending.downloadingTitle", { name: title }));

    try {
      const classifyMeta = findTemplateClassifyMeta(item.classifyId);
      const result = await downloadSingleTemplateToLocal({
        storeJson: divoomStoreJson,
        divoomJson: isSimulatedDeviceMode() ? divoomStoreJson : divoomJson,
        clockId: id,
        classifyId: item.classifyId,
        classifyName: classifyMeta?.ClassifyName,
        classifyNameEn: classifyMeta?.ClassifyNameEn,
        getSlotByItem: getTemplateSlotByItem,
        isImageItem: isTemplateImageItem,
        loadFontInfo: loadFontInfoJsonForSync,
        checkFontFileExists: checkLocalFontBinExists,
        loadClassifyCache: loadClassifyCacheJsonForSync,
        getBaseClassifyData: getTemplateClassifyData,
        fallbackClassifyData: TEMPLATE_CLASSIFY_FALLBACK,
        origin: location.origin,
        onProgress: (patch) => {
          updateTemplateDownloadProgressDialog(
            patch?.percent ?? 0,
            patch?.message || ""
          );
        }
      });

      item.status = "installed";
      const enrichedCache = await enrichTemplateClassifyNamesFromStore(result.classifyCache);
      setTemplateClassifyDataRuntime(enrichedCache);
      await loadTemplateClassifyCache();
      await loadTemplateConfigIds();
      await loadDefaultFontConfigs();
      pendingTemplateState.activeClockId = id;
      savePendingTemplateCacheNow();
      await previewTemplateWatchface(id);
      fontStore.log(t("template.pending.downloadDone", { id, name: title }));
    } catch (e) {
      const msg = t("template.pending.downloadFailed", { message: errorToText(e) });
      alert(msg);
      fontStore.log(msg);
    } finally {
      pendingTemplateState.downloading = false;
      closeTemplateDownloadProgressDialog();
      refreshPendingTemplateListUi();
      refreshPendingTemplateCategoryUi();
      refreshTemplateSyncUi();
    }
  }

  async function openPendingTemplatePanel({ rescan = false } = {}) {
    if (rescan) {
      if (!resolveStoreApiDeviceId()) {
        alert(t("template.sync.needDeviceId"));
        refreshTemplateSyncUi();
        return;
      }
      const apiOk = await isDevSyncApiAvailable();
      if (!apiOk) {
        alert(t("template.sync.needDevServer"));
        return;
      }
    }

    if (sidebarBrowseMode !== "template") {
      await activateSidebarTemplateBrowse();
    }
    setTemplatePendingPanelVisible(true);

    if (!rescan) {
      if (!pendingTemplateState.classifyRows.length) {
        const restored = await restorePendingTemplateFromStorage();
        if (!restored) {
          refreshPendingTemplateCategoryUi();
          refreshPendingTemplateListUi();
          refreshTemplateSyncUi();
          return;
        }
      }
      refreshPendingTemplateCategoryUi();
      refreshPendingTemplateListUi();
      refreshTemplateSyncUi();
      return;
    }

    templateSyncState.scanning = true;
    templateSyncState.error = "";
    templateSyncState.message = "";
    pendingTemplateState.scanning = true;
    pendingTemplateState.error = "";
    pendingTemplateState.scanMessage = "";
    refreshPendingTemplateCategoryUi();
    refreshPendingTemplateListUi();
    refreshTemplateSyncUi();

    try {
      const { classifyRows, totalPending, catalogSource } = await scanPendingTemplatesFromDevice({
        storeJson: divoomStoreJson,
        loadExistingCfg: loadTemplateConfigByClockId,
        language: pickSyncLanguage(getLocaleCode()),
        onProgress: (patch) => {
          const msg = String(patch?.message || patch?.phase || "");
          templateSyncState.message = msg;
          pendingTemplateState.scanMessage = msg;
          refreshPendingTemplateListUi();
          refreshTemplateSyncUi();
        }
      });

      if (!totalPending) {
        pendingTemplateState.classifyRows = [];
        pendingTemplateState.savedAt = "";
        pendingTemplateState.catalogSource = "";
        savePendingTemplateCacheToStorage({ classifyRows: [] });
        setTemplatePendingPanelVisible(false);
        setTemplateSyncStatusText(t("template.pending.noneUpToDate"), "ok");
        fontStore.log(t("template.pending.noneUpToDate"));
        refreshViewPendingButtonUi();
        return;
      }

      pendingTemplateState.classifyRows = classifyRows;
      pendingTemplateState.catalogSource = String(catalogSource || "");
      pendingTemplateState.savedAt = new Date().toISOString();
      pendingTemplateState.selectedClassifyId = classifyRows[0]?.ClassifyId ?? null;
      pendingTemplateState.activeClockId = null;
      savePendingTemplateCacheNow();
      const firstRow = getSelectedPendingClassifyRow();
      const firstItem = firstRow?.items?.find((it) => it.status !== "installed");
      if (firstItem) {
        pendingTemplateState.activeClockId = firstItem.clockId;
        void previewPendingTemplateIfAvailable(firstItem.clockId);
      }
      refreshPendingTemplateCategoryUi();
      refreshPendingTemplateListUi();
    } catch (e) {
      pendingTemplateState.error = errorToText(e);
      const msg = t("template.pending.scanFailed", { message: pendingTemplateState.error });
      templateSyncState.error = msg;
      setTemplateSyncStatusText(msg, "error");
      fontStore.log(msg);
    } finally {
      templateSyncState.scanning = false;
      pendingTemplateState.scanning = false;
      refreshTemplateSyncUi();
      refreshPendingTemplateListUi();
    }
  }

  async function initPendingTemplateOnStartup() {
    const restored = await restorePendingTemplateFromStorage();
    refreshViewPendingButtonUi();
    if (!restored || countPendingTemplateItems(pendingTemplateState.classifyRows) <= 0) return;

    await activateSidebarTemplateBrowse();
    setTemplatePendingPanelVisible(true);
    refreshPendingTemplateCategoryUi();
    refreshPendingTemplateListUi();
    const firstRow = getSelectedPendingClassifyRow();
    const firstItem = firstRow?.items?.find((it) => it.status !== "installed");
    if (firstItem) {
      pendingTemplateState.activeClockId = firstItem.clockId;
      void previewPendingTemplateIfAvailable(firstItem.clockId);
    }
  }

  function closeTemplatePendingPanel() {
    savePendingTemplateCacheNow();
    pendingTemplateState.error = "";
    setTemplatePendingPanelVisible(false);
    refreshTemplateListUi();
    refreshViewPendingButtonUi();
  }

  const pendingFontState = {
    scanning: false,
    downloading: false,
    error: "",
    scanMessage: "",
    items: [],
    savedAt: ""
  };

  function savePendingFontCacheNow() {
    savePendingFontCacheToStorage({
      items: pendingFontState.items,
      savedAt: pendingFontState.savedAt || new Date().toISOString()
    });
    refreshViewPendingFontButtonUi();
  }

  async function restorePendingFontFromStorage() {
    const cached = loadPendingFontCacheFromStorage();
    if (!cached) return false;
    const { items } = await reconcilePendingFontItems(cached.items, {
      loadFontInfo: loadFontInfoJsonForSync,
      checkFontFileExists: checkLocalFontBinExists
    });
    if (!items.length) {
      savePendingFontCacheToStorage({ items: [] });
      pendingFontState.items = [];
      pendingFontState.savedAt = "";
      return false;
    }
    pendingFontState.items = items;
    pendingFontState.savedAt = cached.savedAt || "";
    pendingFontState.error = "";
    savePendingFontCacheNow();
    return true;
  }

  function refreshViewPendingFontButtonUi() {
    const btn = dom.btnViewPendingFonts;
    if (!btn) return;
    const count = countPendingFontItems(pendingFontState.items);
    btn.hidden = count <= 0;
    const busy = pendingFontState.scanning || pendingFontState.downloading;
    btn.disabled = busy;
    setNodeText(btn, t("font.btn.viewPending", { count }));
    btn.title = t("font.btn.viewPendingTitle");
  }

  function refreshFontSyncButtonUi() {
    const btn = dom.btnSyncFonts;
    if (!btn) return;
    const hasStoreDeviceId = resolveStoreApiDeviceId() > 0;
    const busy = pendingFontState.scanning || pendingFontState.downloading;
    btn.disabled = busy || !hasStoreDeviceId;
    setNodeText(btn, t("font.btn.sync"));
    btn.title = t("font.btn.syncTitle");
    refreshViewPendingFontButtonUi();
  }

  function refreshDispSyncButtonUi() {
    const btn = dom.btnSyncDisp;
    if (!btn) return;
    const hasStoreDeviceId = resolveStoreApiDeviceId() > 0;
    btn.disabled = dispCatalogSyncing || !hasStoreDeviceId;
    setNodeText(btn, t("disp.btn.sync"));
    btn.title = t("disp.btn.syncTitle");
  }

  function pendingFontReasonLabel(reason) {
    if (reason === "file_missing") return t("font.pending.reasonFileMissing");
    if (reason === "outdated") return t("font.pending.reasonOutdated");
    return t("font.pending.reasonMissing");
  }

  function getSelectedPendingFontItems() {
    return (pendingFontState.items || []).filter(
      (it) => it.status !== "installed" && it.selected !== false
    );
  }

  function refreshPendingFontDialogUi() {
    if (!dom.fontPendingList || !dom.fontPendingHint) return;
    const list = dom.fontPendingList;
    list.innerHTML = "";

    if (pendingFontState.scanning) {
      dom.fontPendingHint.textContent = t("font.pending.scanning", {
        message: pendingFontState.scanMessage || "…"
      });
      return;
    }
    if (pendingFontState.error) {
      dom.fontPendingHint.textContent = t("font.pending.scanFailed", {
        message: pendingFontState.error
      });
      return;
    }

    const visible = (pendingFontState.items || []).filter((it) => it.status !== "installed");
    if (!visible.length) {
      dom.fontPendingHint.textContent = t("font.pending.empty");
      return;
    }

    const savedLabel = formatPendingCacheSavedAt(pendingFontState.savedAt);
    dom.fontPendingHint.textContent = savedLabel
      ? t("font.pending.restored", { time: savedLabel })
      : t("font.pending.hint", { count: visible.length });

    for (const item of visible) {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = item.selected !== false;
      cb.disabled = pendingFontState.downloading;
      cb.addEventListener("change", () => {
        item.selected = cb.checked;
        savePendingFontCacheNow();
      });

      const idEl = document.createElement("span");
      idEl.className = "font-pending-id";
      idEl.textContent = `#${item.id}`;

      const metaEl = document.createElement("span");
      metaEl.className = "font-pending-meta";
      const typeTag = toNum(item.type, 1) === 0 ? "[IMG]" : "[TTF]";
      metaEl.textContent = `${typeTag} ${item.name || `Font ${item.id}`}`;

      const badge = document.createElement("span");
      badge.className = `font-pending-badge is-${item.reason || "missing"}`;
      badge.textContent = pendingFontReasonLabel(item.reason);

      label.append(cb, idEl, metaEl, badge);
      li.append(label);
      list.appendChild(li);
    }

    if (dom.btnFontPendingDownload) {
      dom.btnFontPendingDownload.disabled =
        pendingFontState.downloading || getSelectedPendingFontItems().length === 0;
    }
    if (dom.btnFontPendingSelectAll) dom.btnFontPendingSelectAll.disabled = pendingFontState.downloading;
    if (dom.btnFontPendingSelectNone) dom.btnFontPendingSelectNone.disabled = pendingFontState.downloading;
  }

  function openFontPendingDialog() {
    const dlg = dom.fontPendingDialog;
    if (!dlg) return;
    refreshPendingFontDialogUi();
    if (dlg.open) return;
    if (typeof dlg.showModal === "function") {
      try {
        dlg.showModal();
      } catch (e) {
        fontStore.log(`font pending dialog: ${errorToText(e)}`);
      }
    }
  }

  function closeFontPendingDialog() {
    savePendingFontCacheNow();
    if (dom.fontDownloadProgress) dom.fontDownloadProgress.hidden = true;
    if (dom.fontDownloadStatus) dom.fontDownloadStatus.textContent = "";
    dom.fontPendingDialog?.close?.();
  }

  async function applyMergedFontInfoFromStore(mergedFontInfo) {
    if (!mergedFontInfo?.FontList?.length) return;
    const apiOk = await isDevSyncApiAvailable();
    if (apiOk) {
      try {
        await writeFontInfoViaApi(mergedFontInfo);
      } catch (e) {
        fontStore.log(`font_info.cfg 写入失败: ${errorToText(e)}`);
      }
    }
    fontStore.parseFontListLike(mergedFontInfo);
    refreshFontPreviewSelect();
    rebuildItemEditor();
  }

  function notifyFontLibraryUpToDate() {
    closeFontPendingDialog();
    showLanCenteredMessage(t("font.pending.noneUpToDate"));
    fontStore.log(t("font.pending.noneUpToDate"));
    refreshFontSyncButtonUi();
  }

  async function openPendingFontPanel({ rescan = false } = {}) {
    if (rescan) {
      if (!resolveStoreApiDeviceId()) {
        alert(t("template.sync.needDeviceId"));
        refreshFontSyncButtonUi();
        return;
      }
    }

    if (!rescan) {
      if (!pendingFontState.items.length) {
        const restored = await restorePendingFontFromStorage();
        if (!restored) {
          notifyFontLibraryUpToDate();
          return;
        }
      }
      if (!countPendingFontItems(pendingFontState.items)) {
        notifyFontLibraryUpToDate();
        return;
      }
      openFontPendingDialog();
      return;
    }

    pendingFontState.scanning = true;
    pendingFontState.error = "";
    pendingFontState.scanMessage = t("font.btn.sync");
    refreshFontSyncButtonUi();

    try {
      const { items, mergedFontInfo } = await scanPendingFontsFromStore({
        storeJson: divoomStoreJson,
        loadFontInfo: loadFontInfoJsonForSync,
        checkFontFileExists: checkLocalFontBinExists
      });
      await applyMergedFontInfoFromStore(mergedFontInfo);
      if (!items.length) {
        pendingFontState.items = [];
        pendingFontState.savedAt = "";
        savePendingFontCacheToStorage({ items: [] });
        notifyFontLibraryUpToDate();
        return;
      }
      pendingFontState.items = items;
      pendingFontState.savedAt = new Date().toISOString();
      savePendingFontCacheNow();
      openFontPendingDialog();
      refreshPendingFontDialogUi();
    } catch (e) {
      pendingFontState.error = errorToText(e);
      fontStore.log(t("font.pending.scanFailed", { message: pendingFontState.error }));
      openFontPendingDialog();
      refreshPendingFontDialogUi();
    } finally {
      pendingFontState.scanning = false;
      pendingFontState.scanMessage = "";
      refreshFontSyncButtonUi();
      refreshPendingFontDialogUi();
    }
  }

  async function downloadSelectedPendingFonts() {
    const selected = getSelectedPendingFontItems();
    if (!selected.length) {
      alert(t("font.pending.noneSelected"));
      return;
    }
    const apiOk = await isDevSyncApiAvailable();
    if (!apiOk) {
      alert(t("font.pending.needDevServer"));
      return;
    }

    pendingFontState.downloading = true;
    refreshPendingFontDialogUi();
    refreshFontSyncButtonUi();
    if (dom.fontDownloadProgress) {
      dom.fontDownloadProgress.hidden = false;
      dom.fontDownloadProgress.value = 0;
    }
    if (dom.fontDownloadStatus) dom.fontDownloadStatus.textContent = t("font.pending.downloading");

    try {
      const result = await downloadSelectedFontsToLocal({
        items: selected,
        loadFontInfo: loadFontInfoJsonForSync,
        origin: location.origin,
        onProgress: (patch) => {
          const total = Number(patch?.total) || selected.length;
          const index = Number(patch?.index) || 0;
          const pct = total > 0 ? Math.floor((100 * index) / total) : 0;
          if (dom.fontDownloadProgress) dom.fontDownloadProgress.value = pct;
          if (dom.fontDownloadStatus) {
            dom.fontDownloadStatus.textContent = String(patch?.message || t("font.pending.downloading"));
          }
        }
      });

      const installedIds = new Set(selected.map((it) => Number(it.id)));
      pendingFontState.items = pendingFontState.items
        .map((it) => (installedIds.has(Number(it.id)) ? { ...it, status: "installed" } : it))
        .filter((it) => it.status !== "installed");
      pendingFontState.savedAt = new Date().toISOString();
      savePendingFontCacheNow();
      await loadDefaultFontConfigs();
      refreshFontPreviewSelect();
      renderFontPreview();

      const msg = t("font.pending.downloadDone", {
        written: result.filesWritten,
        failed: result.filesFailed
      });
      if (dom.fontDownloadStatus) dom.fontDownloadStatus.textContent = msg;
      fontStore.log(msg);
      if (!pendingFontState.items.length) {
        notifyFontLibraryUpToDate();
      } else {
        refreshPendingFontDialogUi();
      }
    } catch (e) {
      const msg = t("font.pending.downloadFailed", { message: errorToText(e) });
      alert(msg);
      fontStore.log(msg);
    } finally {
      pendingFontState.downloading = false;
      if (dom.fontDownloadProgress) dom.fontDownloadProgress.hidden = true;
      refreshFontSyncButtonUi();
      refreshPendingFontDialogUi();
    }
  }

  async function initPendingFontsOnStartup() {
    await restorePendingFontFromStorage();
    refreshFontSyncButtonUi();
  }

  function wireFontSyncUi() {
    if (dom.btnViewPendingFonts) {
      dom.btnViewPendingFonts.addEventListener("click", () => {
        if (dom.btnViewPendingFonts.disabled || dom.btnViewPendingFonts.hidden) return;
        void openPendingFontPanel({ rescan: false });
      });
    }
    if (dom.btnSyncFonts) {
      dom.btnSyncFonts.addEventListener("click", () => {
        if (dom.btnSyncFonts.disabled) return;
        void openPendingFontPanel({ rescan: true });
      });
    }
    if (dom.btnSyncDisp) {
      dom.btnSyncDisp.addEventListener("click", () => {
        if (dom.btnSyncDisp.disabled) return;
        void syncDispCatalogFromStore();
      });
    }
    if (dom.btnFontPendingSelectAll) {
      dom.btnFontPendingSelectAll.addEventListener("click", () => {
        for (const item of pendingFontState.items) {
          if (item.status !== "installed") item.selected = true;
        }
        savePendingFontCacheNow();
        refreshPendingFontDialogUi();
      });
    }
    if (dom.btnFontPendingSelectNone) {
      dom.btnFontPendingSelectNone.addEventListener("click", () => {
        for (const item of pendingFontState.items) {
          if (item.status !== "installed") item.selected = false;
        }
        savePendingFontCacheNow();
        refreshPendingFontDialogUi();
      });
    }
    if (dom.btnFontPendingCancel) {
      dom.btnFontPendingCancel.addEventListener("click", () => {
        if (pendingFontState.downloading) return;
        closeFontPendingDialog();
      });
    }
    if (dom.btnFontPendingDownload) {
      dom.btnFontPendingDownload.addEventListener("click", () => {
        if (pendingFontState.downloading) return;
        void downloadSelectedPendingFonts();
      });
    }
    if (dom.fontPendingDialog) {
      dom.fontPendingDialog.addEventListener("cancel", (e) => {
        if (pendingFontState.downloading) e.preventDefault();
      });
    }
  }

  function wireTemplateSyncUi() {
    syncTemplateDomRefs();
    if (dom.btnViewPendingTemplates) {
      dom.btnViewPendingTemplates.addEventListener("click", () => {
        if (dom.btnViewPendingTemplates.disabled || dom.btnViewPendingTemplates.hidden) return;
        void openPendingTemplatePanel({ rescan: false });
      });
    }
    if (dom.btnSyncTemplates) {
      dom.btnSyncTemplates.addEventListener("click", () => {
        if (dom.btnSyncTemplates.disabled) return;
        void openPendingTemplatePanel({ rescan: true });
      });
    }
    if (dom.btnTemplatePendingBack) {
      dom.btnTemplatePendingBack.addEventListener("click", () => {
        if (pendingTemplateState.downloading) return;
        closeTemplatePendingPanel();
      });
    }
    if (dom.templateDownloadDialog) {
      dom.templateDownloadDialog.addEventListener("cancel", (e) => {
        if (pendingTemplateState.downloading) e.preventDefault();
      });
    }
  }

  /**
   * 设备 PATCH 会整表替换 ItemList；编辑器里常见 `image_addr` 仍是叶子名（模板 `.bin` 或用户选图），
   * 而设备侧已是上传后的 http(s) URL。multipart 第二段只刷新 dial / bundle，不会逐个修元素 URL，
   * 故下发前用 GetLocalClockInfo 把「设备已托管的 URL」合并回来，避免只改字体却把图元引用破坏。
   *
   * 例外：编辑器内存里已加载到该项资源字节（`getLocalDispAsset(it).objectUrl`），说明会随 tar 上传，
   * 必须保留编辑器侧的叶子名以与 tar 内文件名对齐——无论是用户选图还是模板预载。
   */
  function mergeItemListImageAddrForLanPatch(editorItems, deviceItems) {
    if (!Array.isArray(editorItems)) return editorItems;
    if (!Array.isArray(deviceItems) || deviceItems.length === 0) return editorItems;
    const n = Math.min(editorItems.length, deviceItems.length);
    return editorItems.map((ed, idx) => {
      const merged = { ...ed };
      if (idx >= n) return merged;
      const willBundleLeaf = !!getLocalDispAsset(ed)?.objectUrl;
      if (willBundleLeaf) return merged;
      const dev = deviceItems[idx];
      const edImg = String(merged.image_addr ?? "").trim();
      const devImg = String(dev?.image_addr ?? dev?.img_addr ?? "").trim();
      const editorLocalLeaf = edImg.length > 0 && !/^https?:\/\//i.test(edImg);
      const deviceHosted = /^https?:\/\//i.test(devImg);
      if (editorLocalLeaf && deviceHosted) merged.image_addr = devImg;
      return merged;
    });
  }

  async function fetchLanEditableClockItemsOrThrow(clockPayload) {
    const data = await divoomJson("Device/GetLocalClockInfo", clockPayload);
    const items = resolveLanClockItemList(data);
    if (!items.length) {
      throw new Error(t("lan.err.precheckEmptyItemList"));
    }
    return items;
  }

  async function buildLanPatchPayloadMergedForMultipart() {
    syncItemIdList();
    const clockId = toNum(state.config.ClockId, 0);
    const clockSel = clockId > 0 ? { ClockId: clockId } : { UseCurrentDisplayClock: true };
    const deviceItems = await fetchLanEditableClockItemsOrThrow(clockSel);
    const mergedItemList = mergeItemListImageAddrForLanPatch(state.config.ItemList, deviceItems);
    return {
      ...clockSel,
      ItemList: mergedItemList.map((item) => ({ ...item })),
      ItemIdList: [...state.config.ItemIdList]
    };
  }

  /**
   * 把单个 hex 颜色规范化成 `#RRGGBB`（小写）以便与设备返回值做严格比较。
   * 设备 `wf_apply_item_patch` 用 `sscanf("#%x")` 解析，对大小写不敏感，但比较时统一规范化能避免 JSON
   * 里写成 `#FFffFF` 等导致误判为「已变更」。
   */
  function normalizeHexColorForLanPatch(hex) {
    const s = ensureColorHex(String(hex ?? ""), "#000000");
    return s.toLowerCase();
  }

  /**
   * 比较编辑器侧 `ItemList[i]` 与设备拉到的 `deviceItems[i]`，构造最小 `ItemPatchList[i].patch`。
   *
   * - 仅包含 `wf_apply_item_patch` 真实可识别的字段。
   * - `image_addr` 只在「编辑器持有该项字节」（即 `bundle_image` 同时设置）或编辑器把它改成新的明确字符串时才下发；
   *   纯模板叶子 vs 设备 http URL 的差异（仅渲染口味不同）不算变更，避免破坏设备已托管的图。
   * - **不下发 `item_id`**：设备侧 `item_id` 用于菜单 / config 关联（例如 `divoom_app_com_get_int_from_config`），
   *   误改会破坏 dial。编辑器的 `syncItemIdList` 仅为满足 CREATE 的 `NEED_STR` 校验生成默认值，
   *   不应该作为 PATCH 的覆盖依据。
   *
   * 返回 `null` 表示该项无任何字段差异（不需要 patch）。
   */
  function computeSingleItemPatch(editorItem, deviceItem, leafMap) {
    if (!editorItem) return null;
    const patch = {};

    for (const k of LAN_PATCH_NUMBER_FIELDS) {
      const eRaw = k === "disp" ? editorItem.disp ?? editorItem.type : editorItem[k];
      const dRaw = k === "disp" ? deviceItem?.disp ?? deviceItem?.type : deviceItem?.[k];
      const eVal = toNum(eRaw, 0);
      const dVal = toNum(dRaw, 0);
      if (eVal !== dVal) patch[k] = eVal;
    }

    for (const k of LAN_PATCH_HEX_COLOR_FIELDS) {
      const eVal = normalizeHexColorForLanPatch(editorItem[k]);
      const dVal = normalizeHexColorForLanPatch(deviceItem?.[k]);
      if (eVal !== dVal) patch[k] = eVal;
    }

    const edImg = String(editorItem.image_addr ?? "").trim();
    const devImg = String(deviceItem?.image_addr ?? deviceItem?.img_addr ?? "").trim();
    const edLeaf = edImg.length > 0 && !/^https?:\/\//i.test(edImg) ? basename(edImg) : "";
    const willBundleThisItem = !!(edLeaf && leafMap?.has?.(edLeaf));
    if (willBundleThisItem) {
      patch.bundle_image = edLeaf;
      patch.image_addr = edLeaf;
    } else {
      const editorIsHttpUrl = /^https?:\/\//i.test(edImg);
      if (editorIsHttpUrl && edImg !== devImg) {
        patch.image_addr = edImg;
      } else if (edImg.length === 0 && devImg.length > 0) {
        patch.image_addr = "";
      }
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  /**
   * 计算用于 `Device/PatchLocalClockInfo` 的 `ItemPatchList`。
   * 长度不一致（用户增删项）时返回 `lengthMismatch=true`，外层应回退到整表替换。
   */
  function computeLanItemPatchList(editorItems, deviceItems, leafMap) {
    if (!Array.isArray(editorItems) || !Array.isArray(deviceItems)) {
      return { patches: [], lengthMismatch: true };
    }
    if (editorItems.length !== deviceItems.length) {
      return { patches: [], lengthMismatch: true };
    }
    const patches = [];
    for (let i = 0; i < editorItems.length; i++) {
      const patch = computeSingleItemPatch(editorItems[i], deviceItems[i], leafMap);
      if (patch) patches.push({ index: i, patch });
    }
    return { patches, lengthMismatch: false };
  }

  function buildCreateClockMetadata(clockName) {
    syncItemIdList();
    const name = String(clockName || "").trim();
    return {
      Command: "Device/CreateLocalClock",
      ReturnCode: 0,
      ClockName: name,
      NameCn: name,
      NameEn: name,
      ClockId: 0,
      ItemList: state.config.ItemList.map((item) => ({ ...item })),
      ItemIdList: [...state.config.ItemIdList]
    };
  }

  function renderDialBackgroundJpegBlobAtQuality(quality) {
    const w = state.width || EDITOR_CANVAS_WIDTH;
    const h = state.height || EDITOR_CANVAS_HEIGHT;
    return new Promise((resolve, reject) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      const img = state.backgroundImage;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = "#141c2b";
        ctx.fillRect(0, 0, w, h);
      }
      c.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("JPEG blob failed"));
      }, "image/jpeg", quality);
    });
  }

  function renderDialBackgroundJpegBlob() {
    return renderDialBackgroundJpegBlobAtQuality(0.88);
  }

  /** 固件常见限制约 512000 字节（见 mcp-divoom-lan 文档）；超限时逐步降低 JPEG 质量。 */
  async function renderDialBackgroundJpegBlobForLanUpload() {
    const maxBytes = 512000;
    let quality = 0.88;
    for (let i = 0; i < 12; i++) {
      const blob = await renderDialBackgroundJpegBlobAtQuality(quality);
      if (blob.size <= maxBytes) return blob;
      quality = Math.max(0.32, quality * 0.86);
    }
    return renderDialBackgroundJpegBlobAtQuality(0.3);
  }

  /**
   * 收集所有「需要随表盘上传」的元素图叶子名（`ItemList[i].image_addr` 非空且非 http URL）。
   *
   * 设计要点（与设备固件解析一致）：
   *  - 设备通过 `wf_bundle_find_clock_bg` 等流程从 tar 内按叶子名读元素文件；JSON 里 `image_addr`
   *    必须与 tar 内文件名一一对应。
   *  - 不区分模板预载（`loadLocalAssetFromUrl`，`fromLocalPick=false`）还是用户本机选图：
   *    只要编辑器在内存里加载到了字节并且 `image_addr` 是个本地叶子名，就必须打进 tar，
   *    否则下发后设备拿不到 `.bin` 资源。
   *  - 跳过 `clock_bg.*`：dial 主图固定为 tar 内 `clock_bg.jpg`，由我们另行写入。
   *  - 跳过 http(s) URL：那是设备已托管的资源，无需重新上传。
   */
  function collectLanBundlableDispAssetLeaves() {
    const byLeaf = new Map();
    for (const item of state.config.ItemList || []) {
      const addr = String(item?.image_addr || "").trim();
      if (!addr) continue;
      if (/^https?:\/\//i.test(addr)) continue;
      const leaf = basename(addr);
      if (!leaf) continue;
      if (/^clock_bg\.(jpe?g|webp)$/i.test(leaf)) continue;
      const asset = getLocalDispAsset(item);
      if (!asset?.objectUrl) continue;
      if (!byLeaf.has(leaf)) byLeaf.set(leaf, asset);
    }
    return byLeaf;
  }

  /**
   * PATCH 语义专用的元素图叶子收集器。与 CREATE 不同的是：设备此时已托管该 dial 的全部既有资源
   * （模板预载的 `.bin`/`.gif` 已经被设备分配 image_id，URL 也已落 cloud），所以**只对用户在编辑器里
   * 显式新选的资源**（`asset.fromLocalPick === true`）触发 tar.gz 上传；模板预载（`fromLocalPick=false`）
   * 跳过——避免无意义地把同一文件再传一遍并改写设备 img_addr 的 cloud URL。
   */
  function collectLanUserPickedDispAssetLeaves() {
    const byLeaf = new Map();
    for (const item of state.config.ItemList || []) {
      const addr = String(item?.image_addr || "").trim();
      if (!addr) continue;
      if (/^https?:\/\//i.test(addr)) continue;
      const leaf = basename(addr);
      if (!leaf) continue;
      if (/^clock_bg\.(jpe?g|webp)$/i.test(leaf)) continue;
      const asset = getLocalDispAsset(item);
      if (!asset?.objectUrl) continue;
      if (asset.fromLocalPick !== true) continue;
      if (!byLeaf.has(leaf)) byLeaf.set(leaf, asset);
    }
    return byLeaf;
  }

  function writeTarNumericField(header, offset, length, value) {
    const n = BigInt(Math.floor(Number(value)));
    let tmp = `${n.toString(8)}\0`;
    tmp = tmp.padStart(Number(length), "0");
    const te = new TextEncoder();
    const b = te.encode(tmp.slice(-length));
    header.fill(0, offset, offset + length);
    header.set(b.slice(-length), offset + length - b.length);
  }

  function buildTarArchiveBytes(files) {
    const te = new TextEncoder();
    const chunks = [];
    for (const { name, data } of files) {
      const hdr = new Uint8Array(512);
      hdr.fill(0);
      hdr.set(te.encode(String(name).slice(0, 100)), 0);
      writeTarNumericField(hdr, 100, 8, 0o644);
      writeTarNumericField(hdr, 108, 8, 0);
      writeTarNumericField(hdr, 116, 8, 0);
      writeTarNumericField(hdr, 124, 12, data.length);
      writeTarNumericField(hdr, 136, 12, Math.floor(Date.now() / 1000));
      hdr[156] = 48;
      hdr.set(te.encode("ustar"), 257);
      hdr[262] = 0;
      hdr.set(te.encode("00"), 263);
      hdr.fill(0x20, 148, 156);
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += hdr[i];
      const chStr = `${sum.toString(8)}\0 `;
      hdr.set(te.encode(chStr.padStart(8)).slice(0, 8), 148);

      chunks.push(hdr, data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) chunks.push(new Uint8Array(pad));
    }
    chunks.push(new Uint8Array(512), new Uint8Array(512));
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  /**
   * 设备 `wf_validate_bundle_slot_image_file` 接受的元素图魔数：
   * - JPEG：`FF D8`
   * - WEBP：`RIFF....WEBP`
   * - PNG：`89 50 4E 47 0D 0A 1A 0A`（仅元素槽位允许，背景图仍只接受 JPEG/WEBP）
   */
  function isBundleSlotSupportedBytes(u8) {
    if (!u8 || u8.length < 12) return false;
    if (u8[0] === 0xff && u8[1] === 0xd8) return true;
    if (
      u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50
    ) {
      return true;
    }
    if (
      u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47 &&
      u8[4] === 0x0d && u8[5] === 0x0a && u8[6] === 0x1a && u8[7] === 0x0a
    ) {
      return true;
    }
    return false;
  }

  /**
   * 兜底：当字节流既不是 JPEG/WEBP 也不是 PNG（例如 BMP、TIFF、ICO 等）时，转码到 JPEG。
   * 透明像素以黑色填充背景（动画 GIF 会丢失帧，仅保留首帧）。
   */
  async function encodeBytesToJpegForBundle(srcBytes, mimeHint) {
    const type = (mimeHint && mimeHint.startsWith("image/")) ? mimeHint : "image/png";
    const blob = new Blob([srcBytes], { type });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImageByObjectUrl(url);
      const w = Math.max(1, img.naturalWidth || img.width || 1);
      const h = Math.max(1, img.naturalHeight || img.height || 1);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = await new Promise((resolve, reject) => {
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9);
      });
      const buf = await out.arrayBuffer();
      return new Uint8Array(buf);
    } finally {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
  }

  /**
   * 让 `clock_bg.tar.gz` 内每张元素图都被设备接受。固件 `wf_validate_bundle_slot_image_file`
   * 元素槽位允许 JPEG/WEBP/PNG（背景图另有 dial-bg 校验函数限定为 JPEG/WEBP）。
   * - JPEG/WEBP/PNG：原字节直通，保留原叶子名（与 ItemList.image_addr 对齐）。
   * - 其它格式（如 BMP/TIFF/ICO/GIF 等）才走 canvas 转码到 JPEG 兜底。
   */
  async function ensureBundleSlotBytesAreSupported(srcBytes, asset, leaf) {
    if (isBundleSlotSupportedBytes(srcBytes)) return srcBytes;
    try {
      const transcoded = await encodeBytesToJpegForBundle(srcBytes, asset?.mimeType || "");
      if (isLanVerboseDebug()) {
        fontStore.log(
          `[LAN bundle] transcoded ${leaf} → JPEG (was ${asset?.mimeType || "?"}, ${srcBytes.length}B → ${transcoded.length}B)`
        );
      }
      return transcoded;
    } catch (e) {
      throw new Error(t("lan.err.bundleAssetFetchFailed", { name: leaf }));
    }
  }

  async function gzipUint8Array(u8) {
    if (typeof CompressionStream === "undefined") {
      throw new Error(t("lan.err.bundleCompressionUnsupported"));
    }
    const blob = new Blob([u8]);
    const cs = new CompressionStream("gzip");
    return new Response(blob.stream().pipeThrough(cs)).blob();
  }

  /**
   * 设备 `/create_local_clock`、`/patch_local_clock` multipart 第二段约定（与固件侧一致）：
   * - `DialAssets: "image"`：单文件 `clock_bg.jpg`（画布 JPEG；无用户底图时为占位纯色画布）。
   * - `DialAssets: "bundle"`：`clock_bg.tar.gz`，内含 `clock_bg.jpg` + `ItemList.image_addr` 需上传的叶子（USTAR + gzip）。
   * - 仅「用户本机选图」(`fromLocalPick`) 的元素打入 tar；模板预载 `.bin` 由设备按内置资源解析，避免无谓 bundle。
   */
  function logLanMultipartScenario(tag, dialPack, leafMap) {
    if (!isLanVerboseDebug()) return;
    const leaves = leafMap && leafMap.size ? [...leafMap.keys()].join(",") : "";
    const hasUserBg = !!(state.backgroundImage && state.backgroundImage.complete && state.backgroundImage.naturalWidth > 0);
    let caseLabel = "1_dial_only";
    if (leafMap?.size) caseLabel = hasUserBg ? "3_dial_and_element_images" : "2_elements_only_placeholder_dial";
    const line =
      `[LAN multipart debug:${tag}] case=${caseLabel} DialAssets=${dialPack.dialAssets} file=${dialPack.multipartFilename}` +
      ` bytes=${dialPack.blob?.size ?? 0} userBg=${hasUserBg} bundleLeaves=${leaves || "-"}`;
    try {
      console.info(line, { leafMap: leaves ? leaves.split(",") : [], dialPack });
    } catch {
      /* ignore */
    }
    try {
      fontStore.log(line);
    } catch {
      /* ignore */
    }
  }

  function logLanMultipartMetadata(tag, meta) {
    if (!isLanVerboseDebug()) return;
    const sample = (meta.ItemList || []).map((it, i) => `${i}:${String(it.image_addr || "").slice(0, 72)}`);
    try {
      console.info(`[LAN JSON debug:${tag}]`, {
        Command: meta.Command,
        DialAssets: meta.DialAssets,
        itemCount: meta.ItemList?.length,
        imageAddrSample: sample
      });
    } catch {
      /* ignore */
    }
    try {
      fontStore.log(
        `[LAN JSON debug:${tag}] Command=${meta.Command} DialAssets=${meta.DialAssets} items=${meta.ItemList?.length ?? 0}`
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * 决定 multipart 第二段：单 JPEG（`DialAssets:image`）或 tar.gz（`DialAssets:bundle`）。
   *
   * @param {Map<string,object>|null} externalLeafMap
   *   非 null 时使用调用方提供的叶子集（PATCH 路径需要按 `fromLocalPick` 过滤，使用
   *   `collectLanUserPickedDispAssetLeaves` 的结果）；为 null 时回落到 CREATE 默认收集策略
   *   （`collectLanBundlableDispAssetLeaves`，包含模板预载）。
   */
  async function resolveLanMultipartDialSecondPart(externalLeafMap = null) {
    const leafMap = externalLeafMap !== null ? externalLeafMap : collectLanBundlableDispAssetLeaves();
    if (!leafMap.size) {
      const blob = await renderDialBackgroundJpegBlobForLanUpload();
      const pack = {
        dialAssets: "image",
        blob,
        multipartFilename: LAN_MULTIPART_DIAL_FILENAME,
        leafSet: new Set()
      };
      logLanMultipartScenario("multipart", pack, leafMap);
      return pack;
    }
    const clockBlob = await renderDialBackgroundJpegBlobForLanUpload();
    const clockBuf = new Uint8Array(await clockBlob.arrayBuffer());
    const files = [{ name: "clock_bg.jpg", data: clockBuf }];
    for (const [leaf, asset] of leafMap) {
      const res = await fetch(asset.objectUrl);
      if (!res.ok) throw new Error(t("lan.err.bundleAssetFetchFailed", { name: leaf }));
      const raw = new Uint8Array(await res.arrayBuffer());
      const safeBytes = await ensureBundleSlotBytesAreSupported(raw, asset, leaf);
      files.push({ name: leaf, data: safeBytes });
    }
    const tarBytes = buildTarArchiveBytes(files);
    const gzBlob = await gzipUint8Array(tarBytes);
    if (isLanVerboseDebug()) {
      fontStore.log(
        t("lan.log.bundleMultipart", {
          leaves: leafMap.size,
          tarBytes: tarBytes.length,
          gzBytes: gzBlob.size
        })
      );
    }
    const pack = {
      dialAssets: "bundle",
      blob: gzBlob,
      multipartFilename: LAN_MULTIPART_BUNDLE_FILENAME,
      leafSet: new Set(leafMap.keys())
    };
    logLanMultipartScenario("multipart", pack, leafMap);
    return pack;
  }

  /**
   * 在把 ItemList 写入 LAN multipart JSON 之前，按真实进入 tar 的叶子集合 `packedLeafSet`
   * 校验每个 `image_addr`：
   *  - 空字符串或 `http(s)://...` URL → 保留原样（云端资源/无图槽位）
   *  - 叶子名命中 `packedLeafSet` → 仅保留 basename（与 tar 内文件名严格对齐）
   *  - 否则 → 清空为 `""`，避免设备触发 `bundle element file missing`
   * 这种"模板预载叶子在本机不可用"的情况会在创建/整表替换路径里出现：模板原本引用了
   * `(image_id+1).bin` 之类资源，但本仓库 `public/template/29/...` 没有对应文件，
   * 编辑器拿不到字节就不会塞进 tar.gz。
   */
  function sanitizeItemListImageAddrForLanUpload(items, packedLeafSet) {
    const stripped = [];
    const sanitized = (items || []).map((raw, index) => {
      const item = { ...raw };
      const addr = String(item.image_addr || "").trim();
      if (!addr) return item;
      if (/^https?:\/\//i.test(addr)) return item;
      const leaf = basename(addr);
      if (leaf && packedLeafSet && packedLeafSet.has(leaf)) {
        item.image_addr = leaf;
        return item;
      }
      if (leaf) stripped.push({ index, leaf });
      item.image_addr = "";
      return item;
    });
    if (stripped.length && isLanVerboseDebug()) {
      const head = stripped.slice(0, 8).map((e) => `#${e.index}:${e.leaf}`).join(", ");
      fontStore.log(
        `[LAN sanitize] dropped image_addr for ${stripped.length} item(s) absent from tar: ${head}` +
          (stripped.length > 8 ? ` …(+${stripped.length - 8})` : "")
      );
    }
    return { items: sanitized, stripped };
  }

  function assertNonEmptyDialImageBlob(blob) {
    if (!blob || blob.size < 256) {
      throw new Error(t("lan.err.invalidDialImage"));
    }
  }

  /** Divoom Frame 等设备在 LAN 上常对 `/create_local_clock` 直接返回此笼统错误（实测 multipart 与 patch 无关）。 */
  function isLikelyCreateLocalClockLanRejection(msg) {
    const s = String(msg || "");
    return /missing JSON part|missing file part|invalid image\/bundle|filename in multipart|size mismatch|empty ItemList stage/i.test(
      s
    );
  }

  function formatLanCreateFailureAlert(msg) {
    const raw = String(msg || "").trim();
    if (!raw) return t("lan.err.returnCode", { code: "?" });
    if (isLikelyCreateLocalClockLanRejection(raw)) return t("lan.err.createLikelyUnsupported", { message: raw });
    return raw;
  }

  function resolveLanClockItemList(data) {
    if (!data || typeof data !== "object") return [];
    if (Array.isArray(data.ItemList)) return data.ItemList;
    if (Array.isArray(data.ReturnData?.ItemList)) return data.ReturnData.ItemList;
    if (Array.isArray(data.ReturnData?.DeviceClock?.ItemList)) return data.ReturnData.DeviceClock.ItemList;
    return [];
  }

  let lanDebugHistory = [];

  function isLanVerboseDebug() {
    try {
      if (localStorage.getItem(LAN_DEBUG_STORAGE_VERBOSE) === "1") return true;
    } catch {
      /* ignore */
    }
    return typeof location !== "undefined" && /[?&]lanDebug=1(?:&|$)/.test(location.search);
  }

  function pushLanDebugEntry(entry) {
    lanDebugHistory.push(entry);
    if (lanDebugHistory.length > LAN_DEBUG_HISTORY_MAX) lanDebugHistory.shift();
    try {
      window.__DIVOOM_LAN_DEBUG__ = {
        exportedAt: new Date().toISOString(),
        build: APP_BUILD_NUMBER,
        history: lanDebugHistory.slice()
      };
    } catch {
      /* ignore */
    }
  }

  /** 失败时自动排查：控制台 + 底部日志；剪贴板在仍处用户手势链内时尽量写入最近一条 JSON（无需再手点「LAN 诊断」）。 */
  function logLanAutoDebug(entry, tag) {
    const label = String(tag || "fail");
    try {
      console.warn(`[Divoom LAN auto-debug:${label}]`, entry);
    } catch {
      /* ignore */
    }
    try {
      const tail =
        (entry.ReturnMessage != null ? ` | ${String(entry.ReturnMessage).slice(0, 280)}` : "") +
        (entry.networkError ? ` | ${entry.networkError}` : "");
      fontStore.log(
        `[LAN auto:${label}] ${entry.pathSuffix} ${entry.command} | JSON ${entry.jsonUtf8Bytes}B img ${entry.imageBytes}B` +
          (entry.httpStatus != null ? ` | HTTP ${entry.httpStatus}` : "") +
          (entry.ReturnCode != null ? ` | RC ${entry.ReturnCode}` : "") +
          tail
      );
    } catch {
      /* ignore */
    }
    try {
      const clip = JSON.stringify({ autoDebugTag: label, ...entry }, null, 2);
      void navigator.clipboard?.writeText?.(clip);
    } catch {
      /* ignore */
    }
  }

  function buildLanDiagnosticsText() {
    const lines = [
      "=== Divoom watchface editor — LAN diagnostics ===",
      `build: ${APP_BUILD_NUMBER}`,
      `page: ${typeof location !== "undefined" ? location.href : ""}`,
      `verbose: ${isLanVerboseDebug() ? "on" : `off (set localStorage '${LAN_DEBUG_STORAGE_VERBOSE}'='1' or add ?lanDebug=1, reload)`}`,
      `editor ClockId: ${toNum(state.config?.ClockId, 0)} | ItemList len: ${state.config?.ItemList?.length ?? 0}`,
      `LAN device select value: ${dom.selectLanDevice?.value || ""}`,
      `records: ${lanDebugHistory.length}`,
      ""
    ];
    for (let i = 0; i < lanDebugHistory.length; i++) {
      lines.push(`--- record ${i + 1} @ ${lanDebugHistory[i].ts} ---`);
      lines.push(JSON.stringify(lanDebugHistory[i], null, 2));
      lines.push("");
    }
    return lines.join("\n");
  }

  async function copyLanDiagnosticsToClipboard() {
    const text = buildLanDiagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
      fontStore.log(t("lan.debug.copiedLog"));
      alert(t("lan.debug.copied"));
    } catch {
      console.warn("[Divoom LAN diagnostics]\n", text);
      fontStore.log(t("lan.debug.copyFailedLog"));
      alert(t("lan.debug.copyFailed"));
    }
  }

  const LAN_MULTIPART_ENDPOINT = Object.freeze({
    create: "/create_local_clock",
    patch: "/patch_local_clock"
  });

  const LAN_MULTIPART_COMMAND_BY_PATH = Object.freeze({
    [LAN_MULTIPART_ENDPOINT.create]: "Device/CreateLocalClock",
    [LAN_MULTIPART_ENDPOINT.patch]: "Device/PatchLocalClockInfo"
  });

  /**
   * 严格按设备固件 `divoom_http_server_create_local_clock_handler` /
   * `divoom_http_server_patch_local_clock_handler` 解析顺序构造（z:/.../divoom_app/src/app/divoom_http_server.c）：
   *
   *  1. **首段必须是 JSON**：`upload_do_first_data` 找 `\r` 取 boundary 行 → 找 `\r\n\r\n` →
   *     找 `{` → 找下个 boundary → 倒退到 `}` 抠出 JSON。
   *  2. **次段是文件**，header 必须含 `filename="…"` 与 `Content-Length: N`：`upload_get_file_info`
   *     用 `filename` 落到 `/userdata/app_pic/<file_name>`；`Content-Length` 决定 `cur_file_size`，
   *     COMPLETE 时校验 `file_len == cur_file_size`，否则 `missing file part / size mismatch`。
   *  3. boundary 在 `Content-Type` 中**不加引号**。
   *
   * 字节布局：jsonPart + meta + CRLF + filePart + image + closingBoundary。
   */
  const LAN_MULTIPART_BOUNDARY_MCP = Object.freeze({
    [LAN_MULTIPART_ENDPOINT.create]: "----DivoomMcpCreateClockBoundary7YA4YWxkTrZu0gW",
    [LAN_MULTIPART_ENDPOINT.patch]: "----DivoomMcpPatchClockBoundary7YA4YWxkTrZu0gW"
  });

  async function buildLanMultipartWireForDevice(jsonStr, imageBlob, pathSuffix, dialFileName) {
    assertNonEmptyDialImageBlob(imageBlob);
    const boundary = LAN_MULTIPART_BOUNDARY_MCP[pathSuffix];
    if (!boundary) {
      throw new Error(t("lan.err.multipartUnknownPath", { path: String(pathSuffix) }));
    }
    const enc = new TextEncoder();
    const metaJson = enc.encode(jsonStr);
    const img = new Uint8Array(await imageBlob.arrayBuffer());
    if (img.length !== imageBlob.size) {
      throw new Error(t("lan.err.invalidDialImage"));
    }
    const crlf = "\r\n";
    const filePartName = String(Date.now()).replace(/"/g, "");
    const safeFn = String(dialFileName || LAN_MULTIPART_DIAL_FILENAME).replace(/"/g, "");
    const headJson =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="json"; filename="cmd.json"${crlf}` +
      `Content-Type: application/json${crlf}` +
      `Content-Length: ${metaJson.length}${crlf}` +
      crlf;
    const headFile =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${filePartName}"; filename="${safeFn}"${crlf}` +
      `Content-Type: application/octet-stream${crlf}` +
      `Content-Length: ${img.length}${crlf}` +
      crlf;
    const tail = `${crlf}--${boundary}--${crlf}`;
    const hJson = enc.encode(headJson);
    const hFile = enc.encode(headFile);
    const mid = enc.encode(crlf);
    const tailb = enc.encode(tail);
    const totalLen = hJson.length + metaJson.length + mid.length + hFile.length + img.length + tailb.length;
    const out = new Uint8Array(totalLen);
    let o = 0;
    out.set(hJson, o);
    o += hJson.length;
    out.set(metaJson, o);
    o += metaJson.length;
    out.set(mid, o);
    o += mid.length;
    out.set(hFile, o);
    o += hFile.length;
    out.set(img, o);
    o += img.length;
    out.set(tailb, o);
    return {
      bytes: out,
      contentType: `multipart/form-data; boundary=${boundary}`,
      filePartName,
      contentLength: totalLen
    };
  }

  async function postLanMultipartToDevice(
    pathSuffix,
    metadata,
    imageBlob,
    dialFileName = LAN_MULTIPART_DIAL_FILENAME
  ) {
    const expectedCommand = LAN_MULTIPART_COMMAND_BY_PATH[pathSuffix];
    if (!expectedCommand) {
      throw new Error(t("lan.err.multipartUnknownPath", { path: String(pathSuffix) }));
    }
    if (!metadata || metadata.Command !== expectedCommand) {
      throw new Error(
        t("lan.err.multipartCommandMismatch", {
          path: pathSuffix,
          expected: expectedCommand,
          actual: metadata?.Command != null ? String(metadata.Command) : "(none)"
        })
      );
    }
    const url = resolveDivoomUrl(pathSuffix);
    const jsonStr = JSON.stringify(metadata);
    const enc = new TextEncoder();
    const entry = {
      ts: new Date().toISOString(),
      phase: "multipart",
      pathSuffix,
      fetchUrl: url,
      pageHref: typeof location !== "undefined" ? location.href : "",
      viteDev: Boolean(import.meta.env?.DEV),
      useProxyTunnel: shouldUseLanProxyTunnel(),
      lanTargetBase: getLanTargetBase() || "",
      editorClockId: toNum(state.config?.ClockId, 0),
      command: metadata.Command,
      dialAssets: metadata.DialAssets,
      clockName: metadata.ClockName,
      payloadClockId: metadata.ClockId,
      useCurrentDisplayClock: metadata.UseCurrentDisplayClock === true,
      itemListLen: Array.isArray(metadata.ItemList) ? metadata.ItemList.length : 0,
      itemIdListLen: Array.isArray(metadata.ItemIdList) ? metadata.ItemIdList.length : 0,
      itemIdListHead: Array.isArray(metadata.ItemIdList) ? metadata.ItemIdList.slice(0, 48) : [],
      jsonUtf8Bytes: enc.encode(jsonStr).length,
      imageFileName: dialFileName,
      imageBytes: imageBlob?.size ?? 0,
      imageMime: imageBlob?.type || "",
      multipartWireNote: "Frame LAN multipart: part1 JSON(name=json,filename=cmd.json) + part2 file(name=ts,filename=...) both with Content-Length"
    };
    fontStore.log(t("lan.log.multipart", { path: pathSuffix, command: metadata.Command }));
    if (isLanVerboseDebug()) {
      fontStore.log(
        `[LAN verbose] ${pathSuffix} JSON ${entry.jsonUtf8Bytes} B | image ${entry.imageBytes} B\n${jsonStr.slice(0, Math.min(600, jsonStr.length))}${jsonStr.length > 600 ? "…" : ""}`
      );
    }
    const { bytes: multipartBytes, contentType: multipartCt, filePartName, contentLength: multipartContentLength } =
      await buildLanMultipartWireForDevice(jsonStr, imageBlob, pathSuffix, dialFileName);
    entry.multipartTotalBytes = multipartBytes.length;
    entry.multipartContentLength = multipartContentLength;
    entry.multipartBoundary =
      multipartCt.match(/\bboundary="([^"]+)"/i)?.[1] ??
      multipartCt.match(/\bboundary=([^;\s]+)/i)?.[1]?.replace(/^"+|"+$/g, "") ??
      "";
    entry.multipartFilePartName = filePartName;
    let res;
    let text = "";
    try {
      res = await fetch(
        url,
        buildLanFetchOptions({
          method: "POST",
          headers: {
            "Content-Type": multipartCt,
            "Content-Length": String(multipartContentLength)
          },
          body: multipartBytes
        })
      );
      text = await res.text();
    } catch (e) {
      entry.networkError = errorToText(e);
      pushLanDebugEntry(entry);
      logLanAutoDebug(entry, "network");
      throw new Error(t("lan.err.network", { message: entry.networkError }));
    }
    entry.httpStatus = res.status;
    entry.responseBytes = text.length;
    entry.responseHead = text.slice(0, 1500);
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (pe) {
      entry.responseJsonError = errorToText(pe);
    }
    if (data && typeof data === "object") {
      entry.deviceEchoCommand = data.Command;
      entry.ReturnCode = data.ReturnCode;
      entry.ReturnMessage = data.ReturnMessage;
      entry.DeviceType = data.DeviceType;
    }
    pushLanDebugEntry(entry);
    if (isLanVerboseDebug()) {
      fontStore.log(
        `[LAN verbose] HTTP ${res.status} | echo.Command=${entry.deviceEchoCommand ?? "?"} ReturnCode=${entry.ReturnCode ?? "?"}`
      );
    }
    if (!res.ok) {
      logLanAutoDebug(entry, "http");
      throw new Error(t("lan.err.http", { status: res.status, text: text.slice(0, 240) }));
    }
    if (data && data.ReturnCode !== undefined && Number(data.ReturnCode) !== 0) {
      logLanAutoDebug(entry, "device");
      throw new Error(String(data.ReturnMessage || t("lan.err.returnCode", { code: data.ReturnCode })));
    }
    return data;
  }

  async function divoomCreateMultipart(metadata, imageBlob, dialFileName = LAN_MULTIPART_DIAL_FILENAME) {
    return postLanMultipartToDevice(LAN_MULTIPART_ENDPOINT.create, metadata, imageBlob, dialFileName);
  }

  async function divoomPatchLocalClockMultipart(metadata, imageBlob, dialFileName = LAN_MULTIPART_DIAL_FILENAME) {
    return postLanMultipartToDevice(LAN_MULTIPART_ENDPOINT.patch, metadata, imageBlob, dialFileName);
  }

  function extractLanResponseClockId(data) {
    if (!data || typeof data !== "object") return NaN;
    const tryNum = (v) => {
      const n = toNum(v, NaN);
      return Number.isFinite(n) && n > 0 ? n : NaN;
    };
    const immediate = [
      tryNum(data.ClockId),
      tryNum(data.clockId),
      tryNum(data.ClockID),
      tryNum(data.ReturnData?.ClockId),
      tryNum(data.ReturnData?.clockId),
      tryNum(data.returnData?.ClockId),
      tryNum(data.DeviceClock?.ClockId),
      tryNum(data.data?.ClockId)
    ].find(Number.isFinite);
    if (Number.isFinite(immediate)) return immediate;
    const nestedLists = [
      data.ClockIdList,
      data.ClockIds,
      data.ClockIDs,
      data.ReturnData?.ClockIdList,
      data.DeviceClockList
    ];
    for (const lst of nestedLists) {
      if (!Array.isArray(lst) || !lst.length) continue;
      const last = lst[lst.length - 1];
      const n = typeof last === "object" && last !== null ? tryNum(last.ClockId) : tryNum(last);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function resolveLanDeviceCreateClockName() {
    let nm = String(getClockDisplayName(state.config) || "").trim();
    if (nm) return nm;
    if (activeLocalWatchfaceId) {
      const rec = getWatchface(activeLocalWatchfaceId);
      nm = String(rec?.name || "").trim();
      if (nm) return nm;
    }
    return "";
  }

  function openLanCreateConfirmDialogForDeviceCreate() {
    if (toNum(state.config.ClockId, 0) > 0) return;
    if (!dom.lanCreateDialog?.showModal) {
      alert(t("lan.dialog.missing"));
      return;
    }
    const name = resolveLanDeviceCreateClockName();
    if (!name) {
      alert(t("lan.err.emptyName"));
      return;
    }
    if (dom.lanCreateTitle) setNodeText(dom.lanCreateTitle, t("lan.dialog.confirmCreateTitle"));
    if (dom.lanCreateBody) setNodeText(dom.lanCreateBody, t("lan.dialog.confirmCreateBody", { name }));
    dom.lanCreateDialog.showModal();
  }

  async function onLanShowCurrentClockOnDeviceClick() {
    const clockId = toNum(state.config.ClockId, 0);
    if (clockId <= 0) return;
    if (!getLanTargetBase()) {
      alert(t("lan.err.noLanTarget"));
      return;
    }
    const btn = dom.btnLanShowCurrentClockOnDevice;
    if (btn) btn.disabled = true;
    try {
      fontStore.log(t("lan.busy"));
      await divoomJson("Channel/SetClockSelectId", { ClockId: clockId });
      fontStore.log(t("lan.success.setClockSelectId", { id: clockId }));
      alert(t("lan.success.setClockSelectId", { id: clockId }));
    } catch (e) {
      alert(errorToText(e));
    } finally {
      refreshLanActionButtons();
    }
  }

  /** LAN 成功类提示：居中 `<dialog>`，替代浏览器原生 `alert`（文案与按钮不可居中样式）。 */
  function showLanCenteredMessage(message) {
    const dlg = dom.lanMessageDialog;
    const body = dom.lanMessageDialogBody;
    if (!dlg || !body) {
      alert(message);
      return;
    }
    body.textContent = message;
    if (!dlg.open) dlg.showModal();
  }

  /**
   * 应用表盘配置（PATCH）。设备固件 `divoom_watchface_local_http_patch_local_clock_with_upload`
   * 同时支持「`ItemList` 整表替换 + `ItemIdList`」与「`ItemPatchList` 字段级补丁」两种语义。
   *
   * 这里优先走「最小补丁」路径以避免覆盖设备侧已有的 `item_id`、`image_addr` 等 metadata；
   * 仅在编辑器侧增删了项（长度不一致）时回退整表替换。
   *
   * 上传第二段（`/patch_local_clock` multipart）的规则：
   * 1) 任何元素 patch 含 `bundle_image` → 必须 `DialAssets:bundle`，第二段为 tar.gz。
   * 2) 否则用户改了 dial 底图 → `DialAssets:image`，第二段为单张 JPEG。
   * 3) 否则纯字段调整（字号/坐标/颜色等）走 `/divoom_api` JSON，无第二段。
   *    （对应固件 `else { divoom_watchface_local_http_patch_local_clock_with_upload(json, NULL, 0) }` 分支。）
   */
  async function onLanApplyWatchfaceConfigClick() {
    if (toNum(state.config.ClockId, 0) <= 0) return;
    if (!state.config.ItemList.length) {
      alert(t("lan.err.emptyItemList"));
      return;
    }
    const btn = dom.btnLanApplyWatchfaceConfig;
    if (btn) btn.disabled = true;
    try {
      fontStore.log(t("lan.busy"));

      syncItemIdList();
      const clockId = toNum(state.config.ClockId, 0);
      const clockSel = clockId > 0 ? { ClockId: clockId } : { UseCurrentDisplayClock: true };
      const deviceItems = await fetchLanEditableClockItemsOrThrow(clockSel);
      const userPickedLeafMap = collectLanUserPickedDispAssetLeaves();
      const cmp = computeLanItemPatchList(state.config.ItemList, deviceItems, userPickedLeafMap);
      const bgDirty = isLanBackgroundDirtyAgainstBaseline();
      const hasBundleLeaf = cmp.patches.some((entry) => !!entry.patch?.bundle_image);

      if (cmp.lengthMismatch) {
        const merged = mergeItemListImageAddrForLanPatch(state.config.ItemList, deviceItems);
        const fullReplaceLeafMap = collectLanBundlableDispAssetLeaves();
        const dialPack = await resolveLanMultipartDialSecondPart();
        assertNonEmptyDialImageBlob(dialPack.blob);
        const sanitizedFull = sanitizeItemListImageAddrForLanUpload(merged, dialPack.leafSet);
        if (sanitizedFull.stripped.length) {
          fontStore.log(
            t("lan.log.createImageAddrStripped", {
              count: sanitizedFull.stripped.length
            })
          );
        }
        const meta = {
          Command: "Device/PatchLocalClockInfo",
          ReturnCode: 0,
          DialAssets: dialPack.dialAssets,
          ...clockSel,
          ItemList: sanitizedFull.items,
          ItemIdList: [...state.config.ItemIdList]
        };
        const itemPatchListForBinding = [];
        sanitizedFull.items.forEach((it, idx) => {
          const addr = String(it?.image_addr || "").trim();
          if (!addr || /^https?:\/\//i.test(addr)) return;
          const leaf = basename(addr);
          if (!leaf || !fullReplaceLeafMap.has(leaf)) return;
          itemPatchListForBinding.push({ index: idx, patch: { bundle_image: leaf } });
        });
        if (itemPatchListForBinding.length > 0) {
          meta.ItemPatchList = itemPatchListForBinding;
        }
        logLanMultipartMetadata("PatchLocalClockInfo (full replace)", meta);
        await divoomPatchLocalClockMultipart(meta, dialPack.blob, dialPack.multipartFilename);
      } else if (cmp.patches.length === 0 && !bgDirty) {
        fontStore.log(t("lan.success.patch"));
        showLanCenteredMessage(t("lan.success.patch"));
        captureLanBaseline();
        return;
      } else if (hasBundleLeaf || bgDirty) {
        const dialPack = await resolveLanMultipartDialSecondPart(
          hasBundleLeaf ? userPickedLeafMap : new Map()
        );
        assertNonEmptyDialImageBlob(dialPack.blob);
        const meta = {
          Command: "Device/PatchLocalClockInfo",
          ReturnCode: 0,
          DialAssets: dialPack.dialAssets,
          ...clockSel
        };
        if (cmp.patches.length > 0) meta.ItemPatchList = cmp.patches;
        logLanMultipartMetadata("PatchLocalClockInfo (surgical)", meta);
        await divoomPatchLocalClockMultipart(meta, dialPack.blob, dialPack.multipartFilename);
      } else {
        const meta = {
          Command: "Device/PatchLocalClockInfo",
          ReturnCode: 0,
          ...clockSel,
          ItemPatchList: cmp.patches
        };
        logLanMultipartMetadata("PatchLocalClockInfo (json-only)", meta);
        await divoomJson("Device/PatchLocalClockInfo", meta);
      }
      fontStore.log(t("lan.success.patch"));
      showLanCenteredMessage(t("lan.success.patch"));
      captureLanBaseline();
    } catch (e) {
      alert(errorToText(e));
      refreshLanActionButtons();
    } finally {
      refreshLanActionButtons();
    }
  }

  async function lanSubmitDeviceCreateWithName(name) {
    if (toNum(state.config.ClockId, 0) > 0) return;
    if (!state.config.ItemList.length) {
      alert(t("lan.err.emptyItemList"));
      return;
    }
    const createBtn = dom.btnLanCreateOnDevice;
    if (createBtn) createBtn.disabled = true;
    try {
      fontStore.log(t("lan.busy"));
      const dialPack = await resolveLanMultipartDialSecondPart();
      assertNonEmptyDialImageBlob(dialPack.blob);
      const baseMeta = buildCreateClockMetadata(name);
      const sanitized = sanitizeItemListImageAddrForLanUpload(baseMeta.ItemList, dialPack.leafSet);
      const meta = {
        ...baseMeta,
        ItemList: sanitized.items,
        DialAssets: dialPack.dialAssets
      };
      if (sanitized.stripped.length) {
        fontStore.log(
          t("lan.log.createImageAddrStripped", {
            count: sanitized.stripped.length
          })
        );
      }
      logLanMultipartMetadata("CreateLocalClock", meta);
      const data = await divoomCreateMultipart(meta, dialPack.blob, dialPack.multipartFilename);
      const createdId = extractLanResponseClockId(data);
      if (Number.isFinite(createdId) && createdId > 0) {
        state.config.ClockId = createdId;
        refreshToolbarClockIdUi();
        rebuildItemEditor();
        fontStore.log(t("lan.success.createClockIdApplied", { id: createdId }));
        alert(t("lan.success.createClockIdApplied", { id: createdId }));
      } else {
        fontStore.log(t("lan.success.create"));
        alert(t("lan.success.create"));
      }
      captureLanBaseline();
      if (activeLocalWatchfaceId) await flushPersistActiveWorkspace();
      refreshLocalWatchfaceListUi();
    } catch (e) {
      alert(`${formatLanCreateFailureAlert(errorToText(e))}\n\n${t("lan.debug.afterFailureHint")}`);
      refreshLanActionButtons();
    } finally {
      refreshLanActionButtons();
    }
  }

  function persistLanDeviceRow(row) {
    const ip = String(row.DevicePrivateIP || "").trim();
    if (!ip) return;
    const base = `http://${ip}:${LAN_DEVICE_HTTP_PORT}`;
    try {
      localStorage.setItem("divoom_lan_device_base", base);
      localStorage.setItem("divoom_lan_selected_device_id", String(row.DeviceId));
    } catch {
      /* ignore */
    }
  }

  function clearPersistedLanDeviceSelection() {
    try {
      localStorage.removeItem("divoom_lan_device_base");
      localStorage.removeItem("divoom_lan_selected_device_id");
    } catch {
      /* ignore */
    }
  }

  async function refreshLanDeviceListUi(opts = {}) {
    const silent = Boolean(opts.silent);
    const sel = dom.selectLanDevice;
    const btn = dom.btnRefreshLanDevices;
    if (!sel) return;
    if (btn) btn.disabled = true;
    try {
      let filtered;
      if (isSimulatedDeviceMode()) {
        filtered = buildSimulatedLanDeviceList();
      } else {
        const url = resolveSameLanDeviceListUrl();
        const res = await fetch(url, { method: "GET", credentials: "omit", cache: "no-store" });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          throw new Error(text.slice(0, 240) || String(res.status));
        }
        if (data && data.ReturnCode !== undefined && Number(data.ReturnCode) !== 0) {
          throw new Error(String(data.ReturnMessage || `ReturnCode ${data.ReturnCode}`));
        }
        const list = Array.isArray(data?.DeviceList) ? data.DeviceList : [];
        filtered = list.filter((d) => LAN_DEVICE_HARDWARE_WHITELIST.has(Number(d.Hardware)));
      }
      lanDeviceRowsById = new Map(filtered.map((d) => [String(d.DeviceId), d]));
      let savedId = "";
      try {
        savedId = localStorage.getItem("divoom_lan_selected_device_id") || "";
      } catch {
        savedId = "";
      }
      sel.innerHTML = "";
      if (!isSimulatedDeviceMode()) {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = t("lan.device.placeholder");
        sel.appendChild(ph);
      }
      for (const d of filtered) {
        const id = String(d.DeviceId);
        const opt = document.createElement("option");
        opt.value = id;
        const name = String(d.DeviceName || id).trim() || id;
        if (isSimulatedDeviceMode()) {
          opt.textContent = `${name} (${t("lan.device.simulated")})`;
        } else {
          opt.textContent = `${name} (${d.DevicePrivateIP})`;
        }
        sel.appendChild(opt);
      }
      if (isSimulatedDeviceMode() && filtered.length) {
        const simRow = filtered[0];
        sel.value = String(simRow.DeviceId);
        try {
          localStorage.setItem("divoom_lan_selected_device_id", String(simRow.DeviceId));
        } catch {
          /* ignore */
        }
      } else if (savedId && lanDeviceRowsById.has(savedId)) {
        sel.value = savedId;
        persistLanDeviceRow(lanDeviceRowsById.get(savedId));
      } else {
        sel.value = "";
        clearPersistedLanDeviceSelection();
      }
      if (!filtered.length && !silent) {
        fontStore.log(t("lan.device.noneInList"));
      }
    } catch (e) {
      const msg = errorToText(e);
      if (!silent) alert(t("lan.device.listFailed", { message: msg }));
      if (!silent) fontStore.log(t("lan.device.listFailed", { message: msg }));
    } finally {
      if (btn) btn.disabled = false;
      refreshLanActionButtons();
      refreshTemplateSyncUi();
    }
  }

  function wireLanDeviceUi() {
    if (dom.btnRefreshLanDevices) {
      dom.btnRefreshLanDevices.hidden = isSimulatedDeviceMode();
      if (!isSimulatedDeviceMode()) {
        dom.btnRefreshLanDevices.addEventListener("click", () => {
          void refreshLanDeviceListUi({ silent: false });
        });
      }
    }
    if (dom.selectLanDevice && isSimulatedDeviceMode()) {
      dom.selectLanDevice.disabled = true;
    }
    if (dom.btnLanCopyDebug) {
      dom.btnLanCopyDebug.addEventListener("click", () => {
        void copyLanDiagnosticsToClipboard();
      });
    }
    if (dom.selectLanDevice) {
      dom.selectLanDevice.addEventListener("change", () => {
        const id = dom.selectLanDevice.value;
        if (!id) {
          clearPersistedLanDeviceSelection();
          refreshLanActionButtons();
          return;
        }
        const row = lanDeviceRowsById.get(id);
        if (row) persistLanDeviceRow(row);
        refreshLanActionButtons();
        refreshTemplateSyncUi();
      });
    }
  }

  function wireLanUi() {
    if (dom.btnLanCreateOnDevice) {
      dom.btnLanCreateOnDevice.addEventListener("click", () => {
        if (dom.btnLanCreateOnDevice.disabled) return;
        openLanCreateConfirmDialogForDeviceCreate();
      });
    }
    if (dom.btnLanApplyWatchfaceConfig) {
      dom.btnLanApplyWatchfaceConfig.addEventListener("click", () => {
        if (dom.btnLanApplyWatchfaceConfig.disabled) return;
        void onLanApplyWatchfaceConfigClick();
      });
    }
    if (dom.btnLanShowCurrentClockOnDevice) {
      dom.btnLanShowCurrentClockOnDevice.addEventListener("click", () => {
        if (dom.btnLanShowCurrentClockOnDevice.hidden || dom.btnLanShowCurrentClockOnDevice.disabled) return;
        void onLanShowCurrentClockOnDeviceClick();
      });
    }
    if (dom.lanCreateCancel && dom.lanCreateDialog) {
      dom.lanCreateCancel.addEventListener("click", () => dom.lanCreateDialog.close());
    }
    if (dom.lanMessageDialogOk && dom.lanMessageDialog) {
      dom.lanMessageDialogOk.addEventListener("click", () => dom.lanMessageDialog.close());
    }
    if (dom.lanCreateForm) {
      dom.lanCreateForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = resolveLanDeviceCreateClockName();
        if (!name) {
          alert(t("lan.err.emptyName"));
          return;
        }
        dom.lanCreateDialog?.close();
        void lanSubmitDeviceCreateWithName(name);
      });
    }
  }

  function applyConfig(raw, sourceLabel) {
    syncEditorCanvasDimensions();
    clearAllLocalDispAssets();
    state.config = normalizeConfig(raw);
    state.previewTextOverrides.clear();
    state.selectedIndex = state.config.ItemList.length ? 0 : -1;
    syncItemIdList();
    dom.txtClockTitle.textContent = getClockDisplayName(state.config);
    refreshWatchDescFields();
    refreshToolbarClockIdUi();
    refreshItemListUi();
    rebuildItemEditor();
    renderWatchface();
    fontStore.log(t("log.configApplied", { source: sourceLabel }));
    captureLanBaseline();
  }

  function refreshTemplateListUi() {
    syncTemplateDomRefs();
    if (!dom.templateList || !dom.templateHint) return;
    const selectedClassify = getSelectedTemplateClassifyRow();
    const categoryTemplateIds = selectedClassify ? selectedClassify.availableIds : [];
    const filtered = [...categoryTemplateIds];

    dom.templateList.innerHTML = "";
    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "template-list-empty";
      li.textContent = templateState.loading ? t("template.hint.loading") : t("template.hint.empty");
      dom.templateList.appendChild(li);
    } else {
      for (const id of filtered) {
        const li = document.createElement("li");
        if (templateState.activeClockId === id) li.classList.add("active");
        const row = document.createElement("div");
        row.className = "template-row-thumb";

        const img = document.createElement("img");
        img.className = "template-thumb-preview";
        img.alt = "";
        img.decoding = "async";
        img.loading = "lazy";
        img.src = `${TEMPLATE_PREVIEW_DIR_33}${id + 1}.png`;

        const textWrap = document.createElement("div");
        textWrap.className = "template-thumb-text";

        const nameSpan = document.createElement("span");
        nameSpan.className = "template-id";
        nameSpan.textContent = getTemplateListItemName(id);

        const sub = document.createElement("span");
        sub.className = "template-thumb-sub";
        sub.textContent = t("template.item.file", { id });

        textWrap.append(nameSpan, sub);
        row.append(img, textWrap);
        li.append(row);

        li.addEventListener("click", () => {
          window.clearTimeout(templateListNavTimer);
          templateState.activeClockId = id;
          refreshSidebarBrowseChrome();
          templateListNavTimer = window.setTimeout(() => {
            void previewTemplateWatchface(id);
          }, 280);
        });
        li.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          window.clearTimeout(templateListNavTimer);
          templateState.activeClockId = id;
          refreshSidebarBrowseChrome();
          void applyTemplateDraftToNamedLocalWatchface(id);
        });

        dom.templateList.appendChild(li);
      }
    }

    if (templateState.loading) {
      dom.templateHint.textContent = t("template.hint.loading");
    } else if (templateState.error) {
      dom.templateHint.textContent = t("template.hint.error", { message: templateState.error });
    } else if (selectedClassify && filtered.length) {
      dom.templateHint.textContent = t("template.hint.browse", { count: filtered.length });
    } else {
      dom.templateHint.textContent = t("template.hint.empty");
    }

    refreshSidebarBrowseChrome();
  }

  async function doesTemplateConfigExist(id) {
    try {
      const path = `${TEMPLATE_CONFIG_DIR}${id}.cfg`;
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return false;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      // Vite dev / preview：不存在的 public 文件会 200 返回 index.html，不能仅看 res.ok。
      if (ct.includes("text/html")) return false;
      const reader = res.body?.getReader?.();
      if (!reader) return false;
      const first = await reader.read();
      try {
        await reader.cancel();
      } catch (e) {
        // ignore
      }
      if (first.done || !first.value?.length) return false;
      let head = "";
      for (let i = 0; i < Math.min(first.value.length, 40); i++) {
        head += String.fromCharCode(first.value[i]);
      }
      return head.trimStart().startsWith("{");
    } catch (e) {
      return false;
    }
  }

  async function probeTemplateConfigIds(minId, maxId, concurrency = TEMPLATE_SCAN_CONCURRENCY) {
    const found = [];
    let cursor = Math.max(TEMPLATE_SCAN_MIN_ID, toNum(minId, TEMPLATE_SCAN_MIN_ID));
    const upper = Math.max(cursor, toNum(maxId, TEMPLATE_SCAN_DEFAULT_MAX_ID));
    const workers = [];
    const workerCount = Math.max(1, toNum(concurrency, TEMPLATE_SCAN_CONCURRENCY));

    for (let i = 0; i < workerCount; i++) {
      workers.push((async () => {
        while (true) {
          const id = cursor;
          cursor += 1;
          if (id > upper) break;
          if (await doesTemplateConfigExist(id)) found.push(id);
        }
      })());
    }
    await Promise.all(workers);
    found.sort((a, b) => a - b);
    return found;
  }

  async function resolveTemplateConfigIds() {
    const scanPaths = [
      withBase("template/config/"),
      "./template/config/",
      "template/config/",
      "./html/template/config/",
      "../html/template/config/",
      "/html/template/config/"
    ];

    for (const p of scanPaths) {
      try {
        const txt = await fetchText(p);
        const ids = parseTemplateIdsFromDirectoryText(txt);
        if (ids.length) return { ids, source: `${p} (dir)` };
      } catch (e) {
        // continue
      }
    }

    let report = null;
    try {
      report = await fetchJson(TEMPLATE_ORGANIZE_REPORT_PATH);
    } catch (e) {
      // ignore
    }
    const reportHints = collectTemplateCandidateIdsFromReport(report);
    const catalogIds = collectClassifyCatalogClockIds();
    const spanHints = [...new Set([...reportHints, ...catalogIds])];
    // 浏览器/Vite 下无法列出目录；若仅用 report 里「缺失」id 算 min，会漏掉 1..(min-1) 等真实存在的 cfg（例如 ClockId 17）。
    const minCandidate = TEMPLATE_SCAN_MIN_ID;
    const maxCandidate = spanHints.length
      ? Math.max(TEMPLATE_SCAN_DEFAULT_MAX_ID, ...spanHints)
      : TEMPLATE_SCAN_DEFAULT_MAX_ID;
    const probed = await probeTemplateConfigIds(minCandidate, maxCandidate, TEMPLATE_SCAN_CONCURRENCY);
    if (probed.length) return { ids: probed, source: "probe" };
    return { ids: [], source: "none" };
  }

  async function loadTemplateConfigIds() {
    syncTemplateDomRefs();
    templateState.loading = true;
    templateState.error = "";
    templateState.metaById = new Map();
    rebuildTemplateClassifyRows();
    refreshTemplateListUi();
    try {
      const result = await resolveTemplateConfigIds();
      templateState.ids = Array.isArray(result.ids) ? result.ids : [];
      templateState.source = result.source || "";
      templateState.metaById = await loadTemplateNameMetaByIds(templateState.ids);
      rebuildTemplateClassifyRows();
      fontStore.log(t("log.templateListLoaded", { count: templateState.ids.length, source: templateState.source || "unknown" }));
    } catch (err) {
      templateState.ids = [];
      templateState.metaById = new Map();
      templateState.source = "";
      templateState.error = errorToText(err);
      rebuildTemplateClassifyRows();
      fontStore.log(t("log.templateListFailed", { message: templateState.error }));
    } finally {
      templateState.loading = false;
      refreshTemplateListUi();
    }
  }

  async function loadTemplateConfigByClockId(clockId) {
    const id = toNum(clockId, NaN);
    if (!Number.isFinite(id)) return null;
    const paths = [
      `${TEMPLATE_CONFIG_DIR}${id}.cfg`,
      withBase(`template/config/${id}.cfg`),
      `template/config/${id}.cfg`,
      `./html/template/config/${id}.cfg`,
      `../html/template/config/${id}.cfg`,
      `/html/template/config/${id}.cfg`
    ];
    return loadFirstJson(paths);
  }

  async function loadTemplateBackgroundByClockId(clockId) {
    const bgFileId = toNum(clockId, 0) + 1;
    return loadFirstTemplateAsset(TEMPLATE_DIR_15, String(bgFileId), TEMPLATE_BG_EXT_CANDIDATES);
  }

  async function loadTemplateAppPreviewByClockId(clockId) {
    const previewFileId = toNum(clockId, 0) + 1;
    return loadFirstTemplateAsset(TEMPLATE_PREVIEW_DIR_33, String(previewFileId), TEMPLATE_PREVIEW_EXT_CANDIDATES);
  }

  async function applyTemplateImageAssetsByClockId(clockId, token) {
    const id = toNum(clockId, 0);
    let total = 0;
    let loaded = 0;
    let missing = 0;
    let unmapped = 0;
    const list = state.config.ItemList || [];

    for (const item of list) {
      if (token !== templateState.loadToken) return { aborted: true, total, loaded, missing, unmapped };
      if (!isTemplateImageItem(item)) continue;
      total += 1;
      const slot = getTemplateSlotByItem(id, item);
      if (!Number.isFinite(slot) || slot <= 0) {
        unmapped += 1;
        continue;
      }
      const result = await loadFirstTemplateAsset(TEMPLATE_DIR_29, String(slot), TEMPLATE_IMG_EXT_CANDIDATES);
      if (token !== templateState.loadToken) {
        releaseStandaloneAsset(result.asset);
        return { aborted: true, total, loaded, missing, unmapped };
      }
      if (result.asset) {
        setLocalDispAsset(item, result.asset);
        item.image_addr = result.asset.name || `${slot}.bin`;
        loaded += 1;
      } else {
        missing += 1;
      }
    }
    return { aborted: false, total, loaded, missing, unmapped };
  }

  async function previewTemplateWatchface(clockId) {
    const id = toNum(clockId, NaN);
    if (!Number.isFinite(id)) return;

    syncEditorCanvasDimensions();
    window.clearTimeout(namingDebounceTimer);

    const token = ++templateState.loadToken;
    templateState.activeClockId = id;
    activeLocalWatchfaceId = "";
    namingPromptDismissed = false;
    refreshSidebarBrowseChrome();
    refreshTemplateListUi();
    fontStore.log(t("log.templateApplying", { id }));

    let raw = null;
    try {
      raw = await loadTemplateConfigByClockId(id);
    } catch (e) {
      raw = null;
    }
    if (token !== templateState.loadToken) return;
    if (!raw) {
      templateState.activeClockId = null;
      refreshSidebarBrowseChrome();
      refreshTemplateListUi();
      state.backgroundSourceLabel = "";
      refreshBackgroundSourceLabel();
      fontStore.log(t("log.templateConfigLoadFailed", { id }));
      return;
    }

    clearBackgroundObjectUrl();
    state.backgroundImage = null;
    state.backgroundName = "";
    state.backgroundSourceLabel = "";
    refreshBackgroundSourceLabel();
    clearAppPreviewState();
    applyConfig(raw, t("source.templateConfig", { id }));

    const [bgResult, previewResult, imageResult] = await Promise.all([
      loadTemplateBackgroundByClockId(id),
      loadTemplateAppPreviewByClockId(id),
      applyTemplateImageAssetsByClockId(id, token)
    ]);
    if (token !== templateState.loadToken) {
      releaseStandaloneAsset(bgResult.asset);
      releaseStandaloneAsset(previewResult.asset);
      return;
    }

    const summaryParts = [];
    if (bgResult.asset) {
      setBackgroundFromAsset(bgResult.asset);
      const rel = String(bgResult.path || "").trim();
      state.backgroundSourceLabel = rel ? absoluteUrlFromResolvedPath(rel) : "";
    } else {
      state.backgroundSourceLabel = "";
      summaryParts.push(t("template.resource.bgMissing"));
    }
    refreshBackgroundSourceLabel();
    if (previewResult.asset) {
      setAppPreviewFromAsset(previewResult.asset);
      const rel = String(previewResult.path || "").trim();
      state.appPreviewSourceLabel = rel ? absoluteUrlFromResolvedPath(rel) : "";
      if (state.config && typeof state.config === "object") {
        state.config.AppImageUrl = previewResult.asset.name || `${id + 1}.png`;
      }
    } else {
      const previewUrl = String(state.config?.AppImageUrl || "").trim();
      state.appPreviewSourceLabel = previewUrl && /^https?:\/\//i.test(previewUrl) ? previewUrl : "";
    }
    refreshAppPreviewSourceLabel();
    if (imageResult && !imageResult.aborted) {
      summaryParts.push(t("template.resource.imageSummary", { ok: imageResult.loaded, total: imageResult.total }));
      if (imageResult.missing > 0) {
        summaryParts.push(t("template.resource.imageMissing", { count: imageResult.missing }));
      }
      if (imageResult.unmapped > 0) {
        summaryParts.push(t("template.resource.imageUnmapped", { count: imageResult.unmapped }));
      }
    }

    renderWatchface();
    fontStore.log(t("log.templateApplied", { id, resourceSummary: summaryParts.join(" ") }));
    refreshTemplateListUi();
    captureLanBaseline();
    syncWorkspaceBaseline();
    refreshSidebarBrowseChrome();
  }

  function refreshItemListUi() {
    dom.itemList.innerHTML = "";
    const list = state.config.ItemList || [];
    dom.txtItemCount.textContent = String(list.length);
    list.forEach((item, idx) => {
      const li = document.createElement("li");
      if (idx === state.selectedIndex) li.classList.add("active");
      const i = document.createElement("span");
      i.className = "idx";
      i.textContent = `#${idx}`;
      const label = document.createElement("div");
      label.className = "disp-label";
      label.textContent = dispComment(toNum(item.disp, 0));
      li.append(i, label);
      li.addEventListener("click", () => {
        state.selectedIndex = idx;
        refreshItemListUi();
        rebuildItemEditor();
        renderWatchface();
      });
      dom.itemList.appendChild(li);
    });
    dom.btnDupItem.disabled = state.selectedIndex < 0;
    dom.btnDelItem.disabled = state.selectedIndex < 0;
    dom.btnItemUp.disabled = state.selectedIndex <= 0;
    dom.btnItemDown.disabled = state.selectedIndex < 0 || state.selectedIndex >= list.length - 1;
  }

  function buildFontSelectForEditor(currentFontId) {
    const select = document.createElement("select");
    select.dataset.key = "font";
    const currentId = toNum(currentFontId, 0);
    const metas = fontStore.getAllMetas();
    if (!metas.length) {
      const opt = document.createElement("option");
      opt.value = String(currentId);
      opt.textContent = t("font.select.noMetaCurrent", { id: currentId });
      select.appendChild(opt);
      select.disabled = true;
      return select;
    }
    let hasCurrent = false;
    for (const meta of metas) {
      const opt = document.createElement("option");
      opt.value = String(meta.id);
      const typeTag = toNum(meta.type, 1) === 0 ? "[IMG]" : "[TTF]";
      const label = meta.name || t("common.unnamed");
      opt.textContent = `${label} (#${meta.id}) ${typeTag}`;
      if (meta.id === currentId) hasCurrent = true;
      select.appendChild(opt);
    }
    if (!hasCurrent) {
      const opt = document.createElement("option");
      opt.value = String(currentId);
      const meta = fontStore.getMeta(currentId);
      const label = meta?.name || t("font.select.unknownCurrent", { id: currentId });
      opt.textContent = meta?.name ? `${meta.name} (#${currentId})` : label;
      select.appendChild(opt);
    }
    select.value = String(currentId);
    return select;
  }

  function getAllDispIds() {
    const ids = new Set(
      Object.keys(DISP_NAME_MAP)
        .map((id) => toNum(id, NaN))
        .filter((id) => Number.isFinite(id))
    );
    for (const meta of dispCatalogStore.getAllMetas()) ids.add(meta.id);
    return [...ids].sort((a, b) => a - b);
  }

  function collectDispPickerGroups() {
    /** @type {{ groupKey: string, label: string, dispIds: number[] }[]} */
    const groups = [];
    const catalogIds = new Set();

    if (dispCatalogStore.hasCatalog() && dispCatalogStore.classifyList.length) {
      for (const cls of dispCatalogStore.classifyList) {
        const rows = (cls.dispItemList || []).slice().sort((a, b) => a.id - b.id);
        const classifyLabel = dispCatalogStore.getClassifyLabel(cls);
        groups.push({
          groupKey: `cat-${cls.id}`,
          label: classifyLabel ? `${classifyLabel} (${rows.length})` : `(${rows.length})`,
          dispIds: rows.map((row) => row.id)
        });
        for (const row of rows) catalogIds.add(row.id);
      }
    }

    const extras = getAllDispIds()
      .filter((id) => !catalogIds.has(id))
      .sort((a, b) => a - b);
    if (extras.length) {
      groups.push({
        groupKey: "extras",
        label: `${t("disp.cat.other")} (${extras.length})`,
        dispIds: extras
      });
    }

    return groups;
  }

  function findDispPickerGroup(groups, dispId) {
    const meta = dispCatalogStore.getMeta(dispId);
    if (meta?.classifyId) {
      const fromClassify = groups.find((group) => group.groupKey === `cat-${meta.classifyId}`);
      if (fromClassify) return fromClassify;
    }
    return groups.find((group) => group.dispIds.includes(dispId)) || null;
  }

  function fillDispItemSelect(select, dispIds, selectedId) {
    select.replaceChildren();
    const hasSelected = dispIds.includes(selectedId);
    if (!hasSelected) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("editor.dispPickItem");
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
    }
    for (const dispId of dispIds) {
      const opt = document.createElement("option");
      opt.value = String(dispId);
      opt.textContent = formatDispOptionText(dispId);
      const meta = dispCatalogStore.getMeta(dispId);
      if (meta?.desc) opt.title = meta.desc;
      if (dispId === selectedId) opt.selected = true;
      select.appendChild(opt);
    }
    if (hasSelected) select.value = String(selectedId);
  }

  function buildDispSelectForEditor(currentDisp) {
    const currentId = toNum(currentDisp, 0);
    const groups = collectDispPickerGroups();
    let activeGroup = findDispPickerGroup(groups, currentId);
    if (!activeGroup && Number.isFinite(currentId)) {
      const orphanGroup = {
        groupKey: "__current__",
        label: t("disp.cat.currentValue"),
        dispIds: [currentId]
      };
      groups.push(orphanGroup);
      activeGroup = orphanGroup;
    }
    if (!activeGroup && groups.length) activeGroup = groups[0];

    const row = document.createElement("div");
    row.className = "disp-picker-row";

    const categorySelect = document.createElement("select");
    categorySelect.className = "disp-picker-category";
    categorySelect.title = t("editor.dispPickCategory");
    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.groupKey;
      opt.textContent = group.label;
      if (activeGroup && group.groupKey === activeGroup.groupKey) opt.selected = true;
      categorySelect.appendChild(opt);
    }

    const itemSelect = document.createElement("select");
    itemSelect.className = "disp-picker-item";
    itemSelect.dataset.key = "disp";
    itemSelect.title = t("editor.dispPickItem");
    fillDispItemSelect(itemSelect, activeGroup?.dispIds || [], currentId);

    categorySelect.addEventListener("change", () => {
      const group = groups.find((entry) => entry.groupKey === categorySelect.value);
      fillDispItemSelect(itemSelect, group?.dispIds || [], currentId);
    });

    row.append(categorySelect, itemSelect);
    return { node: row, input: itemSelect };
  }

  function buildAlignSelectForEditor(currentAlign) {
    const select = document.createElement("select");
    select.dataset.key = "alig";
    const currentId = toNum(currentAlign, 0);
    const options = [
      { value: 4, label: t("editor.align.left") },
      { value: 5, label: t("editor.align.right") },
      { value: 3, label: t("editor.align.center") }
    ];
    let hasCurrent = false;
    for (const row of options) {
      const opt = document.createElement("option");
      opt.value = String(row.value);
      opt.textContent = t("editor.align.option", { label: row.label, value: row.value });
      if (row.value === currentId) hasCurrent = true;
      select.appendChild(opt);
    }
    if (!hasCurrent) {
      const opt = document.createElement("option");
      opt.value = String(currentId);
      const guess =
        guessAlign(currentId) === "left"
          ? t("editor.align.left")
          : guessAlign(currentId) === "right"
            ? t("editor.align.right")
            : t("editor.align.center");
      opt.textContent = t("editor.align.current", { label: guess, value: currentId });
      select.appendChild(opt);
    }
    select.value = String(currentId);
    return select;
  }

  function buildColorPaletteInputForEditor(currentColor) {
    const normalized = ensureColorHex(currentColor, "#ffffff");
    const box = document.createElement("div");
    box.className = "color-palette-editor";

    const pickerRow = document.createElement("div");
    pickerRow.className = "color-picker-row";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-picker";
    colorInput.value = normalized;

    const hexValue = document.createElement("span");
    hexValue.className = "color-hex-value";
    hexValue.textContent = normalized.toUpperCase();
    pickerRow.append(colorInput, hexValue);

    const swatches = document.createElement("div");
    swatches.className = "color-swatch-list";
    const swatchButtons = [];
    for (const color of PRESET_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch-btn";
      btn.title = color.toUpperCase();
      btn.style.background = color;
      btn.addEventListener("click", () => {
        colorInput.value = color;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
      swatches.appendChild(btn);
      swatchButtons.push(btn);
    }

    const refreshSwatchActive = () => {
      const current = ensureColorHex(colorInput.value, normalized).toLowerCase();
      for (const btn of swatchButtons) {
        if (btn.title.toLowerCase() === current) btn.classList.add("active");
        else btn.classList.remove("active");
      }
    };
    colorInput.addEventListener("input", () => {
      const v = ensureColorHex(colorInput.value, normalized);
      hexValue.textContent = v.toUpperCase();
      refreshSwatchActive();
    });
    refreshSwatchActive();

    box.append(pickerRow, swatches);
    return { input: colorInput, node: box };
  }

  function buildLocalAssetEditor(item) {
    const disp = toNum(item?.disp, 0);
    const rule = getLocalAssetRule(disp);
    if (!rule) return null;

    const wrap = document.createElement("div");
    wrap.className = "editor-field full asset-file-editor";

    const head = document.createElement("div");
    head.className = "asset-file-head";

    const title = document.createElement("span");
    title.className = "k";
    title.textContent = `${t("editor.asset.title")} (${formatDispOptionText(disp)})`;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = t("editor.asset.clear");

    head.append(title, clearBtn);

    const pickHint = document.createElement("div");
    pickHint.className = "asset-pick-hint";
    pickHint.textContent = t("editor.asset.pickHint");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/jpg,image/gif,image/webp,.jpg,.jpeg,.jfif,.webp,.gif";

    const infoGrid = document.createElement("div");
    infoGrid.className = "asset-info-grid";

    const fileInfoBox = document.createElement("div");
    fileInfoBox.className = "asset-info-box";
    const fileInfoTitle = document.createElement("div");
    fileInfoTitle.className = "asset-info-title";
    fileInfoTitle.textContent = t("editor.asset.fileInfoTitle");
    const fileInfoBody = document.createElement("div");
    fileInfoBody.className = "asset-info-body";
    fileInfoBox.append(fileInfoTitle, fileInfoBody);

    const ruleInfoBox = document.createElement("div");
    ruleInfoBox.className = "asset-info-box";
    const ruleInfoTitle = document.createElement("div");
    ruleInfoTitle.className = "asset-info-title";
    ruleInfoTitle.textContent = t("editor.asset.ruleInfoTitle");
    const ruleInfoBody = document.createElement("div");
    ruleInfoBody.className = "asset-info-body";
    ruleInfoBox.append(ruleInfoTitle, ruleInfoBody);

    infoGrid.append(fileInfoBox, ruleInfoBox);

    const refresh = () => {
      const asset = getLocalDispAsset(item);
      const left = [];
      fileInfoBox.classList.remove("asset-status-ok", "asset-status-bad", "asset-status-warn");
      if (!asset) {
        left.push(t("editor.asset.empty"));
      } else {
        const pathText = String(asset.sourceUrl || "").trim()
          ? String(asset.sourceUrl).trim()
          : asset.fromLocalPick
            ? t("editor.asset.localUploadPathHint", { name: asset.name || "-" })
            : (asset.name || "-");
        left.push(t("editor.asset.filePath", { path: pathText }));
        left.push(t("editor.asset.fileSize", { size: formatBytes(asset.size) }));
        left.push(t("editor.asset.fileType", { type: asset.mimeType || asset.format || "-" }));
        if (Number.isFinite(asset.frameCount)) left.push(t("editor.asset.frameCount", { count: asset.frameCount }));
        else left.push(t("editor.asset.frameUnknown"));
        const status = validateLocalAssetRule(rule, asset.frameCount);
        left.push(status.text);
        if (status.level === "ok") fileInfoBox.classList.add("asset-status-ok");
        else if (status.level === "bad") fileInfoBox.classList.add("asset-status-bad");
        else fileInfoBox.classList.add("asset-status-warn");
      }
      fileInfoBody.textContent = left.join("\n");

      const right = [];
      right.push(t("editor.asset.support"));
      right.push(getRuleText(rule));
      if (rule.mode === "pointer") right.push(t("editor.asset.pointerHint"));
      else right.push(t("editor.asset.applyHint"));
      ruleInfoBody.textContent = right.join("\n");

      clearBtn.disabled = !asset;
    };

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (alertIfLocalPickFileTooLarge(file)) {
        fileInput.value = "";
        refresh();
        return;
      }
      try {
        const asset = await loadLocalAssetFromFile(file);
        setLocalDispAsset(item, asset);
        item.image_addr = file.name || "";
        refreshItemListUi();
        renderWatchface();
        onLocalConfigEdited();
      } catch (err) {
        alert(t("alert.localAssetLoadFailed", { message: errorToText(err) }));
      } finally {
        fileInput.value = "";
        refresh();
      }
    });

    clearBtn.addEventListener("click", () => {
      clearLocalDispAsset(item);
      item.image_addr = "";
      refreshItemListUi();
      renderWatchface();
      refresh();
      onLocalConfigEdited();
    });

    refresh();
    wrap.append(head, pickHint, fileInput, infoGrid);
    return wrap;
  }

  function rebuildItemEditor() {
    dom.itemEditor.innerHTML = "";
    const item = state.config.ItemList[state.selectedIndex];
    if (!item) {
      const tip = document.createElement("div");
      tip.className = "hint";
      tip.textContent = t("editor.tipSelectItem");
      dom.itemEditor.appendChild(tip);
      return;
    }
    const currentDisp = toNum(item.disp, 0);
    const isImageLikeDisp = IMAGE_DISP_IDS.has(currentDisp) || POINTER_DISP_IDS.has(currentDisp) || isLocalAssetDisp(currentDisp);
    const fontId = resolveItemFontId(item);
    const isImageFont = fontStore.isImageFont(fontId);

    const rotateSingleImage = ROTATE_SINGLE_IMAGE_DISP_IDS.has(currentDisp);
    editorFields.forEach((field) => {
      if (
        field.key === "hier" &&
        !(IMAGE_DISP_IDS.has(currentDisp) || PHOTO_ALBUM_PREVIEW_DISP_IDS.has(currentDisp))
      )
        return;
      const hideByImageDisp =
        isImageLikeDisp &&
        IMAGE_EDITOR_HIDDEN_FIELDS.has(field.key) &&
        !(rotateSingleImage && (field.key === "sep" || field.key === "size"));
      if (hideByImageDisp) return;
      if (isImageFont && !IMAGE_FONT_EDITOR_VISIBLE_KEYS.has(field.key)) return;
      const wrap = document.createElement("label");
      wrap.className = "editor-field";
      if (field.full) wrap.classList.add("full");
      const k = document.createElement("span");
      k.className = "k";
      let keyLabel = t(field.labelKey);
      if (field.key === "hier") k.title = t("editor.hierTierHint");
      if (field.key === "disp") keyLabel += ` (${dispComment(toNum(item.disp, 0))})`;
      if (field.key === "font") {
        const meta = fontStore.getMeta(fontId);
        keyLabel += meta ? ` (${meta.name || t("common.unnamed")} #${meta.id})` : ` (#${fontId})`;
      }
      k.textContent = keyLabel;
      let input;
      let controlNode;
      if (field.key === "disp") {
        const dispPicker = buildDispSelectForEditor(item.disp);
        input = dispPicker.input;
        controlNode = dispPicker.node;
      } else if (field.key === "alig") {
        input = buildAlignSelectForEditor(item.alig);
        controlNode = input;
      } else if (field.key === "hier") {
        input = document.createElement("select");
        input.dataset.key = "hier";
        const v = toNum(item.hier, 0);
        const tiers = [
          [0, "editor.hierTier0"],
          [1, "editor.hierTier1"],
          [2, "editor.hierTier2"]
        ];
        for (const [val, lk] of tiers) {
          const o = document.createElement("option");
          o.value = String(val);
          o.textContent = t(lk);
          input.appendChild(o);
        }
        input.value = String([0, 1, 2].includes(v) ? v : 0);
        controlNode = input;
      } else if (field.key === "font") {
        input = buildFontSelectForEditor(fontId);
        controlNode = input;
      } else if (field.type === "color-palette") {
        const c = buildColorPaletteInputForEditor(item[field.key]);
        input = c.input;
        controlNode = c.node;
      } else {
        input = document.createElement("input");
        input.type = field.type;
        input.dataset.key = field.key;
        if (field.key === "__preview_text__") {
          input.value = state.previewTextOverrides.get(state.selectedIndex) || "";
          const disp = toNum(item.disp, 0);
          if (IMAGE_DISP_IDS.has(disp) || POINTER_DISP_IDS.has(disp)) {
            input.placeholder = t("editor.previewText.imageHint");
          } else {
            input.placeholder = t("editor.previewText.default", { text: getPlaceholderText(disp, item) });
          }
        } else {
          input.value = item[field.key] ?? "";
        }
        controlNode = input;
      }
      const onFieldChange = () => {
        const current = state.config.ItemList[state.selectedIndex];
        if (!current) return;
        if (field.key === "__preview_text__") {
          const val = input.value.trim();
          if (val) state.previewTextOverrides.set(state.selectedIndex, val);
          else state.previewTextOverrides.delete(state.selectedIndex);
        } else if (field.key === "disp") {
          const nextDisp = toNum(input.value, NaN);
          if (!Number.isFinite(nextDisp)) return;
          current[field.key] = nextDisp;
        } else if (field.key === "hier") {
          current[field.key] = toNum(input.value, 0);
        } else if (field.key === "font") {
          current[field.key] = toNum(input.value, toNum(current[field.key], 0));
        } else if (field.key === "alig") {
          current[field.key] = toNum(input.value, toNum(current[field.key], 0));
        } else if (field.type === "number") {
          current[field.key] = toNum(input.value, 0);
        } else {
          current[field.key] = input.value;
          if (field.key === "color_1" || field.key === "color_2") {
            current[field.key] = ensureColorHex(current[field.key], field.key === "color_1" ? "#ffffff" : "#000000");
          }
        }
        syncItemIdList();
        refreshItemListUi();
        renderWatchface();
        onLocalConfigEdited();
        // 连续输入时不要重建表单，否则会丢焦点导致“只能输入一次”。
        // 仅在切换需要重排编辑项的字段后重建。
        if (field.key === "disp" || field.key === "font") {
          rebuildItemEditor();
        }
      };
      input.addEventListener(
        field.key === "font" || field.key === "disp" || field.key === "alig" || field.key === "hier"
          ? "change"
          : "input",
        onFieldChange
      );
      wrap.append(k, controlNode || input);
      dom.itemEditor.appendChild(wrap);
    });

    const localAssetEditor = buildLocalAssetEditor(item);
    if (localAssetEditor) dom.itemEditor.appendChild(localAssetEditor);
  }

  function getPlaceholderText(disp, item) {
    const now = new Date();
    const hour2 = pad2(now.getHours());
    const min2 = pad2(now.getMinutes());
    const weekdayEn = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const weekdayCn = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const monEn = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    if (APP_DATA_DISP_IDS.has(disp)) return "42";
    if (NETWORK_TEXT_DISP_IDS.has(disp)) return "NET:OK";
    if (disp >= 261 && disp < 280) return "SUB DIAL";

    switch (disp) {
      case 1:
        return pad2(now.getSeconds());
      case 2:
        return min2;
      case 3:
        return hour2;
      case 4:
        return `${hour2}:${min2}`;
      case 5:
        return `${hour2}:${min2}:${pad2(now.getSeconds())}`;
      case 406:
        return hour2[0];
      case 407:
        return hour2[1];
      case 408:
        return min2[0];
      case 409:
        return min2[1];
      case 6:
      case 37:
      case 170:
      case 195:
      case 213:
      case 214:
        return weekdayEn[now.getDay()];
      case 12:
        return weekdayCn[now.getDay()];
      case 7:
      case 196:
        return String(now.getFullYear());
      case 8:
      case 215:
      case 216:
        return pad2(now.getDate());
      case 9:
        return pad2(now.getMonth() + 1);
      case 15:
        return now.getHours() >= 12 ? "PM" : "AM";
      case 19:
      case 33:
      case 166:
        return "45dB";
      case 20:
      case 29:
        return "初五";
      case 21:
      case 30:
        return "甲辰";
      case 22:
      case 28:
        return "三月";
      case 23:
        return "谷雨";
      case 24:
        return "宜 出行";
      case 25:
        return "忌 熬夜";
      case 26:
        return "天秤座";
      case 27:
      case 180:
      case 194:
        return monEn[now.getMonth()];
      case 31:
        return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][now.getDay()];
      // DIVOOM_CLOCK_DISP_SUPPORT_TEMP_DIGIT：固件为纯数字分段，不包含 °C/°F 等单位
      case 32:
        return "23";
      // TEMP_DIGIT2：数字 + °（无 C/F）
      case 254:
        return "23°";
      // TEMP_DIGIT3：数字 + ℃ 或 ℉（设备按设定二选一）；预览示例用 ℃ 字符
      case 339:
        return "23℃";
      // DIVOOM_CLOCK_DISP_SUPPORT_HUMI_ONLY_NUM：仅湿度数值；百分号画在背景图上
      case 342:
        return "50";
      case 82:
      case 83:
      case 86:
      case 87:
      case 90:
      case 91:
      case 94:
      case 95:
      case 96:
      case 97:
      case 147:
      case 148:
      case 149:
      case 157:
      case 238:
      case 239:
        return "23°C";
      case 35:
        return "Divoom";
      case 36:
      case 158:
        return `${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
      case 39:
        return `${monEn[now.getMonth()]}.${pad2(now.getDate())}`;
      case 49:
      case 56:
      case 104:
      case 154:
      case 155:
      case 219:
      case 220:
        return "HELLO DIVOOM";
      case 51:
      case 109:
      case 198:
      case 202:
      case 203:
        return "12";
      case 53:
        return `${pad2(now.getDate())} ${monEn[now.getMonth()]} ${now.getFullYear()}`;
      case 54:
      case 81:
      case 85:
      case 89:
      case 93:
      case 240:
        return "Sunny";
      case 75:
      case 76:
        return `${pad2((now.getHours() + 8) % 24)}:${pad2(now.getMinutes())}`;
      case 77:
        return "TOKYO";
      case 80:
      case 84:
      case 88:
      case 92:
      case 169:
        return "FRI";
      case 101:
        return "甲辰年 三月初五";
      case 102:
        return "宜运动 忌拖延";
      case 103:
        return "三月 初五";
      case 153:
        return formatDate(now);
      case 156:
        return `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}`;
      case 176:
        return "06:08";
      case 177:
        return "18:42";
      case 178:
        return "Team Sync";
      case 179:
        return "10:00";
      case 182:
        return "ALARM";
      case 191:
        return "TIDE";
      case 193:
        return `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${String(now.getFullYear()).slice(-2)}`;
      case 199:
        return String(now.getHours());
      case 200:
        return String(now.getMinutes());
      case 201:
        return String(now.getSeconds());
      case 204:
        return "06:08 / 18:42";
      case 205:
        return "01:25:10";
      case 208:
      case 211:
      case 212:
      case 217:
        return "Waxing";
      case 241:
        return String(now.getDate());
      default:
        return item.item_id ? String(item.item_id) : `DISP_${disp}`;
    }
  }

  function drawBackground(ctx) {
    ctx.clearRect(0, 0, state.width, state.height);
    const g = ctx.createLinearGradient(0, 0, state.width, state.height);
    g.addColorStop(0, "#05080f");
    g.addColorStop(1, "#0c1220");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);
    if (!state.backgroundImage) return;
    const img = state.backgroundImage;
    const sw = img.width || 1;
    const sh = img.height || 1;
    const scale = Math.max(state.width / sw, state.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (state.width - dw) / 2;
    const dy = (state.height - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /**
   * PC 预览近似 LVGL divoom_lvgl_dial_menu_add_rotate_image_handle（mul_flag=0）：
   * angle→摆动幅度或 360°整圈；sep→rotate_time 周期(ms)；size→rotate_flag（固件映射 font_size）。
   */
  function computeRotateSingleImageAngleDeg(item, nowMs = Date.now()) {
    const angleVal = toNum(item.angle, 0);
    const rotateFlag = toNum(item.size ?? item.font_size, 0) !== 0;
    const periodMs = Math.max(300, toNum(item.sep, 4000));

    if (!angleVal) return 0;

    if (angleVal >= 359.5 && angleVal <= 360.5) {
      const frac = (nowMs % periodMs) / periodMs;
      let deg = frac * 360;
      if (!rotateFlag) deg = 360 - deg;
      return deg;
    }

    const omega = (2 * Math.PI) / periodMs;
    let deg = angleVal * Math.sin(nowMs * omega);
    if (rotateFlag) deg = -deg;
    return deg;
  }

  function getPointerDegree(disp, now = new Date()) {
    let deg = 0;
    if (disp === 131) {
      deg = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
    } else if (disp === 132) {
      deg = (now.getMinutes() + now.getSeconds() / 60) * 6;
    } else {
      deg = now.getSeconds() * 6;
    }
    return deg;
  }

  function loadPhotoAlbumDemoImages() {
    const urls = [1, 2, 3, 4].map((n) => withBase(`pic/${n}@1x.webp`));
    void Promise.all(
      urls.map(
        (url) =>
          new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
          })
      )
    ).then((imgs) => {
      photoAlbumDemoImages = imgs.filter(Boolean);
      renderWatchface();
    });
  }

  function drawImageContain(ctx, img, boxX, boxY, boxW, boxH) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.min(boxW / iw, boxH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = boxX + (boxW - dw) / 2;
    const dy = boxY + (boxH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawPhotoAlbumDemoPreview(ctx, item, disp) {
    if (!PHOTO_ALBUM_PREVIEW_DISP_IDS.has(disp)) return false;
    const imgs = photoAlbumDemoImages;
    if (!imgs.length) return false;
    let st = photoAlbumPreviewItemState.get(item);
    const now = Date.now();
    if (!st) {
      st = { lastSwitch: now, idx: Math.floor(Math.random() * imgs.length) };
      photoAlbumPreviewItemState.set(item, st);
    } else if (now - st.lastSwitch >= PHOTO_ALBUM_PREVIEW_ROTATE_MS) {
      st.lastSwitch = now;
      let nxt;
      if (imgs.length <= 1) {
        nxt = 0;
      } else {
        do {
          nxt = Math.floor(Math.random() * imgs.length);
        } while (nxt === st.idx);
      }
      st.idx = nxt;
    }
    const img = imgs[st.idx];
    if (!img?.naturalWidth) return false;
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const w = Math.max(8, toNum(item.w, 50));
    const h = Math.max(8, toNum(item.h, 50));
    ctx.fillStyle = colorToRgba(item.color_2, 0.12);
    ctx.fillRect(x, y, w, h);
    drawImageContain(ctx, img, x, y, w, h);
    return true;
  }

  function drawPointer(ctx, item, disp) {
    const now = new Date();
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const w = Math.max(8, toNum(item.w, 50));
    const h = Math.max(8, toNum(item.h, 50));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radius = Math.min(w, h) / 2;
    const deg = getPointerDegree(disp, now);
    const rad = (deg - 90) * Math.PI / 180;
    const ex = cx + Math.cos(rad) * (radius * 0.9);
    const ey = cy + Math.sin(rad) * (radius * 0.9);

    ctx.strokeStyle = colorToRgba(item.color_1, 1);
    ctx.lineWidth = Math.max(2, Math.round(toNum(item.size, 18) / 12));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = colorToRgba(item.color_2, 0.8);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, ctx.lineWidth), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLocalDispAsset(ctx, item, disp) {
    if (!isLocalAssetDisp(disp)) return false;
    const asset = getLocalDispAsset(item);
    if (!asset?.image) return false;
    const now = new Date();
    const frames = Array.isArray(asset.frames) && asset.frames.length ? asset.frames : null;
    const frameSource = frames
      ? (frames[resolveFrameIndexForDisp(disp, frames.length, now)] || frames[0] || asset.image)
      : asset.image;
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const w = Math.max(8, toNum(item.w, 50));
    const h = Math.max(8, toNum(item.h, 50));
    if (disp === 131 || disp === 132 || disp === 233) {
      const deg = getPointerDegree(disp, now);
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(frameSource, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    }
    if (ROTATE_SINGLE_IMAGE_DISP_IDS.has(disp)) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const deg = computeRotateSingleImageAngleDeg(item, now.getTime());
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(frameSource, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    }
    ctx.drawImage(frameSource, x, y, w, h);
    return true;
  }

  function drawImagePlaceholder(ctx, item, disp, labelText) {
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const w = Math.max(12, toNum(item.w, 60));
    const h = Math.max(12, toNum(item.h, 60));
    ctx.fillStyle = colorToRgba(item.color_2, 0.28);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(122,173,255,0.85)";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = colorToRgba(item.color_1, 1);
    const title = labelText || `IMG ${disp}`;
    ctx.font = `${Math.max(10, Math.floor(Math.min(h * 0.28, 18)))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + w / 2, y + h / 2);
    if (item.image_addr) {
      ctx.fillStyle = "rgba(210,226,255,0.85)";
      ctx.font = "11px monospace";
      ctx.fillText(basename(item.image_addr), x + w / 2, y + h - 10);
    }
  }

  function resolveTextBackgroundFill(item) {
    // Keep canvas preview closer to device behavior: text background is opt-in.
    const enabled = toNum(
      item.bg_fill ?? item.fill_bg ?? item.preview_bg_fill ?? item.previewFillBg,
      0
    ) === 1;
    if (!enabled) return null;
    const alpha = clamp(
      toNum(item.bg_alpha ?? item.fill_alpha ?? item.preview_bg_alpha, 22) / 100,
      0,
      1
    );
    if (alpha <= 0) return null;
    return {
      color: ensureColorHex(item.color_2, "#000000"),
      alpha
    };
  }

  function drawTextItem(ctx, item, disp, text) {
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const w = Math.max(8, toNum(item.w, 120));
    const h = Math.max(8, toNum(item.h, 40));
    const angle = toNum(item.angle, 0);
    const fontId = resolveItemFontId(item);
    const fontSize = Math.max(8, toNum(item.size ?? item.font_size, Math.min(60, Math.round(h * 0.8))));
    const isImageFont = fontStore.isImageFont(fontId);
    const spacingPx = normalizeCharSpacing(item.sep, 0);
    const color1 = ensureColorHex(item.color_1, "#ffffff");
    const textBackgroundFill = isImageFont ? null : resolveTextBackgroundFill(item);

    const drawMain = () => {
      if (isImageFont) {
        fontStore.drawImageFontText(ctx, text, item, { x, y, w, h }, fontId);
        return;
      }
      if (textBackgroundFill) {
        ctx.fillStyle = colorToRgba(textBackgroundFill.color, textBackgroundFill.alpha);
        ctx.fillRect(x, y, w, h);
      }

      const family = fontStore.getFamily(fontId);
      const align = guessAlign(item.alig ?? item.align);
      ctx.font = `${fontSize}px ${family ? `"${family}"` : "sans-serif"}`;
      ctx.fillStyle = colorToRgba(color1, 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let tx = x + 2;
      const ty = y + h / 2;

      if (MULTI_LINE_DISP_IDS.has(disp) && text.length > 12) {
        const lines = wrapTextByWidth(ctx, text, Math.max(12, w - 6), spacingPx);
        const lineH = Math.max(12, fontSize * 1.12);
        const startY = y + (h - lineH * lines.length) / 2 + lineH / 2;
        lines.forEach((line, i) => {
          const lw = spacingPx === 0 ? ctx.measureText(line).width : measureTextWithSpacing(ctx, line, spacingPx);
          let lineX = x + 2;
          if (align === "center") lineX = x + Math.max(0, (w - lw) / 2);
          if (align === "right") lineX = x + Math.max(0, w - lw - 2);
          if (spacingPx === 0) ctx.fillText(line, lineX, startY + i * lineH);
          else drawTextWithSpacing(ctx, line, lineX, startY + i * lineH, spacingPx);
        });
      } else {
        if (spacingPx === 0) {
          if (align === "center") tx = x + w / 2;
          if (align === "right") tx = x + w - 2;
          ctx.textAlign = align;
          ctx.fillText(text, tx, ty);
        } else {
          const lw = measureTextWithSpacing(ctx, text, spacingPx);
          if (align === "center") tx = x + Math.max(0, (w - lw) / 2);
          if (align === "right") tx = x + Math.max(0, w - lw - 2);
          drawTextWithSpacing(ctx, text, tx, ty, spacingPx);
        }
      }
    };

    if (angle !== 0) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle * Math.PI / 180);
      ctx.translate(-cx, -cy);
      drawMain();
      ctx.restore();
    } else {
      drawMain();
    }
  }

  /** 画布选中高亮矩形（与各分支绘制用到的 x/y/w/h 一致）。 */
  function outlineBoxForCanvasItem(item, disp) {
    const x = toNum(item.x, 0);
    const y = toNum(item.y, 0);
    const d = toNum(disp, 0);
    if (POINTER_DISP_IDS.has(d)) {
      return {
        x,
        y,
        w: Math.max(8, toNum(item.w, 50)),
        h: Math.max(8, toNum(item.h, 50))
      };
    }
    if (IMAGE_DISP_IDS.has(d) || toNum(item.image_id, 0) > 0 || !!item.image_addr) {
      return {
        x,
        y,
        w: Math.max(12, toNum(item.w, 60)),
        h: Math.max(12, toNum(item.h, 60))
      };
    }
    return {
      x,
      y,
      w: Math.max(8, toNum(item.w, 120)),
      h: Math.max(8, toNum(item.h, 40))
    };
  }

  /**
   * 本地「我的设计」下选中项：更明显的高亮描边（不依赖元素半透明 transp）。
   */
  function drawCanvasItemSelectionHighlight(ctx, item, disp) {
    const pad = 5;
    const { x, y, w, h } = outlineBoxForCanvasItem(item, disp);
    const px = x - pad;
    const py = y - pad;
    const pw = w + pad * 2;
    const ph = h + pad * 2;

    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(77,154,247,0.22)";
    ctx.fillRect(px, py, pw, ph);

    ctx.strokeStyle = "rgba(41,132,229,0.98)";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);

    ctx.strokeStyle = "rgba(240,251,255,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 8, py + 8, pw - 16, ph - 16);

    ctx.restore();
  }

  function wrapTextByWidth(ctx, text, maxWidth, spacingPx = 0) {
    const chars = [...text];
    const lines = [];
    let cur = "";
    for (const ch of chars) {
      const next = cur + ch;
      const nextWidth = spacingPx === 0 ? ctx.measureText(next).width : measureTextWithSpacing(ctx, next, spacingPx);
      if (nextWidth > maxWidth && cur) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 6);
  }

  /** 画布叠加顺序（与分层字段 hier 对齐）：1 最底层 → 0 默认中层 → 2 最顶层；同层内保持 ItemList 顺序。 */
  function hierPaintSortKey(item, stableIdx) {
    const h = toNum(item?.hier, 0);
    let tier = 1;
    if (h === 1) tier = 0;
    else if (h === 2) tier = 2;
    return { tier, stableIdx };
  }

  function renderWatchface() {
    if (dom.canvas.width !== state.width) dom.canvas.width = state.width;
    if (dom.canvas.height !== state.height) dom.canvas.height = state.height;
    drawBackground(watchCtx);

    const list = state.config.ItemList || [];
    const indexed = list.map((item, idx) => ({ item, idx }));
    indexed.sort((a, b) => {
      const ka = hierPaintSortKey(a.item, a.idx);
      const kb = hierPaintSortKey(b.item, b.idx);
      if (ka.tier !== kb.tier) return ka.tier - kb.tier;
      return ka.stableIdx - kb.stableIdx;
    });

    for (const { item, idx } of indexed) {
      const disp = toNum(item.disp, 0);
      const alpha = clamp(toNum(item.transp, 100) / 100, 0, 1);
      watchCtx.save();
      watchCtx.globalAlpha = alpha;
      if (POINTER_DISP_IDS.has(disp)) {
        if (!drawLocalDispAsset(watchCtx, item, disp)) drawPointer(watchCtx, item, disp);
      } else if (IMAGE_DISP_IDS.has(disp) || item.image_id > 0 || !!item.image_addr) {
        if (!(PHOTO_ALBUM_PREVIEW_DISP_IDS.has(disp) && drawPhotoAlbumDemoPreview(watchCtx, item, disp))) {
          if (!drawLocalDispAsset(watchCtx, item, disp)) {
            const lbl = item.image_addr ? `IMG ${disp}` : `PLACEHOLDER ${disp}`;
            drawImagePlaceholder(watchCtx, item, disp, lbl);
          }
        }
      } else {
        const txt = state.previewTextOverrides.get(idx) || getPlaceholderText(disp, item);
        drawTextItem(watchCtx, item, disp, txt);
      }
      watchCtx.restore();
    }

    /** 选中框最后绘制，盖住所有元素（不受 hier 叠放顺序遮挡）。 */
    if (
      sidebarBrowseMode === "local" &&
      state.selectedIndex >= 0 &&
      state.selectedIndex < list.length
    ) {
      const sel = list[state.selectedIndex];
      if (sel) {
        drawCanvasItemSelectionHighlight(watchCtx, sel, toNum(sel.disp, 0));
      }
    }

    applyCanvasZoom();
  }

  function ensurePreviewStageResizeObserver() {
    if (previewStageResizeObs || typeof ResizeObserver === "undefined" || !dom.previewStage) return;
    previewStageResizeObs = new ResizeObserver(() => {
      if (sidebarBrowseMode !== "template") return;
      requestAnimationFrame(() => {
        if (sidebarBrowseMode !== "template") return;
        applyCanvasZoom();
      });
    });
    previewStageResizeObs.observe(dom.previewStage);
  }

  function applyTemplatePreviewFit() {
    const stage = dom.previewStage;
    const canvas = dom.canvas;
    const dialW = EDITOR_CANVAS_WIDTH;
    const dialH = EDITOR_CANVAS_HEIGHT;
    if (!stage || !canvas || !dialW || !dialH) return;
    const cs = window.getComputedStyle(stage);
    const padX =
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const cr = stage.getBoundingClientRect();
    let availW = cr.width - padX;
    let availH = cr.height - padY;
    if (availW < 40 || availH < 40) {
      const zFallback = 22;
      canvas.style.width = `${Math.round(dialW * (zFallback / 100))}px`;
      canvas.style.height = `${Math.round(dialH * (zFallback / 100))}px`;
      return;
    }
    const zw = (availW / dialW) * 100;
    const zh = (availH / dialH) * 100;
    const z = clamp(Math.min(zw, zh), 10, 100);
    canvas.style.width = `${Math.round(dialW * (z / 100))}px`;
    canvas.style.height = `${Math.round(dialH * (z / 100))}px`;
  }

  function applyCanvasZoom() {
    if (sidebarBrowseMode === "template") {
      applyTemplatePreviewFit();
      return;
    }
    const z = clamp(toNum(state.zoom, 55), 20, 220);
    dom.canvas.style.width = `${Math.round(state.width * z / 100)}px`;
    dom.canvas.style.height = `${Math.round(state.height * z / 100)}px`;
    dom.txtZoom.textContent = `${Math.round(z)}%`;
  }

  function matchesFontFilter(meta, keyword) {
    if (!keyword) return true;
    const parts = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length) return true;
    const typeTag = toNum(meta.type, 1) === 0 ? "img type0" : "ttf type1";
    const haystack = [
      String(meta.id),
      String(meta.name || ""),
      String(meta.url || ""),
      String(meta.charset || ""),
      typeTag
    ].join(" ").toLowerCase();
    return parts.every((p) => haystack.includes(p));
  }

  function refreshBuiltinFontList() {
    if (!dom.builtinFontList || !dom.selectFontPreview) return;
    const all = fontStore.getAllMetas();
    const keyword = String(dom.inputFontFilter?.value || "").trim();
    const filtered = all.filter((meta) => matchesFontFilter(meta, keyword));
    const activeId = String(dom.selectFontPreview.value || "");
    dom.builtinFontList.innerHTML = "";
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "builtin-font-empty";
      empty.textContent = all.length ? t("font.empty.filtered") : t("font.empty.meta");
      dom.builtinFontList.appendChild(empty);
      return;
    }
    for (const meta of filtered) {
      const row = document.createElement("div");
      row.className = "builtin-font-row";
      if (String(meta.id) === activeId) row.classList.add("active");
      const loaded = fontStore.fontFileById.has(meta.id) ? "✔" : "…";
      const idEl = document.createElement("span");
      idEl.className = "builtin-font-id";
      idEl.textContent = `#${meta.id}`;
      const metaEl = document.createElement("span");
      metaEl.className = "builtin-font-meta";
      metaEl.textContent = `${toNum(meta.type, 1) === 0 ? "[IMG]" : "[TTF]"} ${meta.name || `(${t("common.unnamed")})`} ${loaded}`;
      row.append(idEl, metaEl);
      row.addEventListener("click", () => {
        dom.selectFontPreview.value = String(meta.id);
        refreshBuiltinFontList();
        renderFontPreview();
      });
      dom.builtinFontList.appendChild(row);
    }
  }

  function refreshFontPreviewSelect() {
    if (!dom.selectFontPreview) return;
    const old = dom.selectFontPreview.value;
    dom.selectFontPreview.innerHTML = "";
    const list = fontStore.getAllMetas();
    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("font.select.noMeta");
      dom.selectFontPreview.appendChild(opt);
      refreshBuiltinFontList();
      return;
    }
    for (const meta of list) {
      const opt = document.createElement("option");
      opt.value = String(meta.id);
      const loaded = fontStore.fontFileById.has(meta.id);
      opt.textContent = `${meta.id} ${meta.type === 0 ? "[IMG]" : "[TTF]"} ${meta.name || ""} ${loaded ? "✔" : "…"}`;
      dom.selectFontPreview.appendChild(opt);
    }
    if ([...dom.selectFontPreview.options].some((o) => o.value === old)) {
      dom.selectFontPreview.value = old;
    } else if (dom.selectFontPreview.options.length > 0) {
      dom.selectFontPreview.selectedIndex = 0;
    }
    refreshBuiltinFontList();
  }

  function renderFontPreview() {
    if (!fontPreviewCtx || !dom.fontPreviewCanvas || !dom.selectFontPreview || !dom.inputFontPreviewText) return;
    const ctx = fontPreviewCtx;
    const w = dom.fontPreviewCanvas.width;
    const h = dom.fontPreviewCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a111f";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2e3f61";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const id = toNum(dom.selectFontPreview.value, NaN);
    const text = dom.inputFontPreviewText.value || "0123456789";
    if (!Number.isFinite(id)) {
      ctx.fillStyle = "#8fa5ce";
      ctx.font = "14px sans-serif";
      ctx.fillText(t("font.preview.waitCfg"), 12, 26);
      return;
    }

    const meta = fontStore.getMeta(id);
    if (!meta) {
      ctx.fillStyle = "#ff9aa8";
      ctx.font = "14px sans-serif";
      ctx.fillText(t("font.preview.metaMissing"), 12, 26);
      return;
    }

    const item = {
      font: id,
      size: 44,
      alig: 4,
      color_1: "#ffffff",
      color_2: "#000000",
      transp: 100
    };
    const isImageFontPreview = toNum(meta.type, 1) === 0;
    if (isImageFontPreview) {
      fontStore.drawImageFontText(ctx, text, item, { x: 12, y: 36, w: w - 24, h: 64 });
    } else {
      const family = fontStore.getFamily(id);
      ctx.font = `44px ${family ? `"${family}"` : "sans-serif"}`;
      ctx.fillStyle = "#f2f7ff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 12, 70);
    }

    ctx.fillStyle = "#9fb2d8";
    ctx.font = "12px monospace";
    const charset = meta.charset ? `charset=${meta.charset}` : "charset=<none>";
    ctx.fillText(`id=${meta.id} type=${meta.type} ${charset}`, 12, 110);
  }

  async function loadDispInfoJsonForSync() {
    const paths = [withBase("disp/disp_info.cfg"), "disp/disp_info.cfg"];
    try {
      return await loadFirstJson(paths);
    } catch {
      return null;
    }
  }

  async function loadDispInfoCfg() {
    try {
      const data = await loadDispInfoJsonForSync();
      if (data) dispCatalogStore.loadFromCfg(data);
    } catch {
      /* optional */
    }
  }

  async function syncDispCatalogFromStore() {
    if (!resolveStoreApiDeviceId()) {
      alert(t("template.sync.needDeviceId"));
      refreshDispSyncButtonUi();
      return;
    }
    dispCatalogSyncing = true;
    refreshDispSyncButtonUi();
    try {
      const remote = await fetchDispItemList(divoomStoreJson);
      const local = await loadDispInfoJsonForSync();
      const stats = summarizeDispCatalogSync(local, remote);
      const cfgShape = dispCatalogStore.applyRemoteCatalog(remote);
      const apiOk = await isDevSyncApiAvailable();
      if (apiOk) {
        try {
          await writeDispInfoViaApi(cfgShape);
        } catch (e) {
          fontStore.log(t("disp.sync.writeFailed", { message: errorToText(e) }));
        }
      }
      const syncMsg =
        stats.added + stats.updated > 0
          ? t("disp.sync.changed", {
              added: stats.added,
              updated: stats.updated,
              total: stats.total
            })
          : t("disp.sync.upToDate", { total: stats.total });
      fontStore.log(syncMsg);
      showLanCenteredMessage(syncMsg);
    } catch (e) {
      const msg = errorToText(e);
      fontStore.log(t("disp.sync.failed", { message: msg }));
      alert(t("disp.sync.failed", { message: msg }));
    } finally {
      dispCatalogSyncing = false;
      refreshDispSyncButtonUi();
    }
  }

  async function loadFontInfoJsonForSync() {
    const paths = [withBase("font/font_info.cfg"), "font/font_info.cfg"];
    try {
      return await loadFirstJson(paths);
    } catch {
      return null;
    }
  }

  async function checkLocalFontBinExists(fontId) {
    const fileNum = toNum(fontId, NaN) + 1;
    if (!Number.isFinite(fileNum) || fileNum <= 0) return false;
    const bases =
      Array.isArray(runtime.fontBasePaths) && runtime.fontBasePaths.length
        ? runtime.fontBasePaths
        : [withBase("font/")];
    for (const base of bases) {
      for (const name of [`${fileNum}.bin`, `${fileNum}.BIN`]) {
        try {
          const url = `${ensureSlash(base)}${name}`;
          const res = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (res.ok) return true;
        } catch {
          /* try next */
        }
      }
    }
    return false;
  }

  async function loadDefaultFontConfigs() {
    try {
      const cfgCandidates = [];
      const pushUnique = (list, value) => {
        if (!value) return;
        if (!list.includes(value)) list.push(value);
      };
      const staticCfg = [
        withBase("font/font_info.cfg"),
        "./font/font_info.cfg",
        "font/font_info.cfg",
        "./html/font/font_info.cfg",
        "../font/font_info.cfg",
        "../html/font/font_info.cfg",
        "/font/font_info.cfg",
        "/html/font/font_info.cfg"
      ];
      staticCfg.forEach((p) => pushUnique(cfgCandidates, p));
      try {
        pushUnique(cfgCandidates, new URL(withBase("font/font_info.cfg"), window.location.origin + BASE_URL).toString());
        pushUnique(cfgCandidates, new URL("./font/font_info.cfg", window.location.href).toString());
        pushUnique(cfgCandidates, new URL("./html/font/font_info.cfg", window.location.href).toString());
        pushUnique(cfgCandidates, new URL("../font/font_info.cfg", window.location.href).toString());
        pushUnique(cfgCandidates, new URL("../html/font/font_info.cfg", window.location.href).toString());
      } catch (e) {
        // ignore url build errors
      }

      let appScript = null;
      try {
        appScript = Array.from(document.scripts || []).find((s) => /\/(main|app)\.js(\?|$)/.test(s.src || ""));
      } catch (e) {
        fontStore.log(`读取 document.scripts 失败: ${errorToText(e)}`);
      }
      if (appScript?.src) {
        const base = appScript.src.replace(/\/(main|app)\.js(\?.*)?$/, "/");
        pushUnique(cfgCandidates, `${base}font/font_info.cfg`);
        pushUnique(cfgCandidates, `${base}../font/font_info.cfg`);
      }

      fontStore.log(`字体配置调试: location=${window.location.href}`);
      fontStore.log(`[font_info] 候选路径数量: ${cfgCandidates.length}`);
      const result = await loadFirstJsonWithTrace(cfgCandidates, (line) => fontStore.log(`[font_info] ${line}`));

      let loaded = false;
      let count = 0;
      if (result.data) {
        try {
          count = fontStore.parseFontListLike(result.data);
          loaded = count > 0;
        } catch (e) {
          fontStore.log(`font_info.cfg 解析失败: ${errorToText(e)}`);
        }
      }

      if (loaded) {
        runtime.fontCfgPath = result.path;
        const baseFromCfg = fontBaseFromCfgPath(result.path);
        if (baseFromCfg) {
          runtime.fontBasePaths = [baseFromCfg, ...runtime.fontBasePaths.filter((p) => p !== baseFromCfg)];
          fontStore.log(`字体文件基路径: ${baseFromCfg}`);
        }
        fontStore.log(`已读取字体配置(${count}条): ${result.path} [${result.via}]（字体文件按 ID+1.BIN 规则映射）`);
      } else {
        if (result.data) {
          fontStore.log("font_info.cfg 已读取，但未找到有效 FontList 数组。");
        }
        if (window.location.protocol === "file:") {
          fontStore.log("当前是 file:// 协议，浏览器通常会拦截跨文件读取；请改用本地 HTTP 打开页面。");
        }
        fontStore.log("未读取到 html/font/font_info.cfg。请优先用本地 HTTP 打开页面，或确认预览环境可访问该文件。");
      }
    } catch (e) {
      fontStore.log(`loadDefaultFontConfigs 异常中断: ${errorToText(e)}`);
    }
  }

  function onAddItem() {
    const idx = state.config.ItemList.length;
    state.config.ItemList.push(createDefaultItem(idx));
    syncItemIdList();
    state.selectedIndex = idx;
    refreshItemListUi();
    rebuildItemEditor();
    renderWatchface();
    onLocalConfigEdited();
  }

  function onDupItem() {
    if (state.selectedIndex < 0) return;
    const src = state.config.ItemList[state.selectedIndex];
    if (!src) return;
    const clone = normalizeItem({ ...src, item_id: `${src.item_id || "item"}_copy` }, state.config.ItemList.length);
    clone.y += 20;
    state.config.ItemList.push(clone);
    syncItemIdList();
    state.selectedIndex = state.config.ItemList.length - 1;
    refreshItemListUi();
    rebuildItemEditor();
    renderWatchface();
    onLocalConfigEdited();
  }

  function onDeleteItem() {
    if (state.selectedIndex < 0) return;
    const deleted = state.config.ItemList[state.selectedIndex];
    if (deleted) clearLocalDispAsset(deleted);
    state.config.ItemList.splice(state.selectedIndex, 1);
    state.previewTextOverrides.delete(state.selectedIndex);
    const remap = new Map();
    for (const [k, v] of state.previewTextOverrides.entries()) {
      remap.set(k > state.selectedIndex ? k - 1 : k, v);
    }
    state.previewTextOverrides = remap;
    state.selectedIndex = Math.min(state.selectedIndex, state.config.ItemList.length - 1);
    syncItemIdList();
    refreshItemListUi();
    rebuildItemEditor();
    renderWatchface();
    onLocalConfigEdited();
  }

  function moveItem(step) {
    const idx = state.selectedIndex;
    const list = state.config.ItemList;
    if (idx < 0 || idx >= list.length) return;
    const target = idx + step;
    if (target < 0 || target >= list.length) return;
    const tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;
    state.selectedIndex = target;
    syncItemIdList();
    refreshItemListUi();
    rebuildItemEditor();
    renderWatchface();
    onLocalConfigEdited();
  }

  function bindEvents() {
    wireLocalWatchDialogs();
    wireAboutAdminUi();

    if (dom.appModeLocal) {
      dom.appModeLocal.addEventListener("click", () => {
        void activateSidebarLocalEdit();
      });
    }
    if (dom.appModeTemplate) {
      dom.appModeTemplate.addEventListener("click", () => {
        void activateSidebarTemplateBrowse();
      });
    }
    if (dom.btnApplyTemplate) {
      dom.btnApplyTemplate.addEventListener("click", () => {
        void applyTemplateDraftToNamedLocalWatchface();
      });
    }

    if (dom.btnNewWatchface) {
      dom.btnNewWatchface.addEventListener("click", () => {
        void startNewBlankWatchface();
      });
    }

    if (dom.btnImportWatchface) {
      dom.btnImportWatchface.addEventListener("click", () => {
        void startImportWatchface();
      });
    }

    if (dom.inputImportWatchfaceJson) {
      dom.inputImportWatchfaceJson.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void importWatchfaceFromJsonFile(file).finally(() => {
          if (dom.inputImportWatchfaceJson) dom.inputImportWatchfaceJson.value = "";
        });
      });
    }

    if (dom.selectTemplateCategory) {
      dom.selectTemplateCategory.addEventListener("change", () => {
        const nextClassifyId = toNum(dom.selectTemplateCategory.value, NaN);
        void selectTemplateClassify(nextClassifyId, { previewFirst: true });
      });
    }

    dom.inputZoom.addEventListener("input", () => {
      state.zoom = clamp(toNum(dom.inputZoom.value, 55), 20, 220);
      applyCanvasZoom();
    });

    wireResponsiveFileInput(dom.inputBgFile);
    wireResponsiveFileInput(dom.inputAppPreviewFile);

    dom.inputBgFile.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (alertIfLocalPickFileTooLarge(file)) {
        if (dom.inputBgFile) dom.inputBgFile.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          clearBackgroundObjectUrl();
          invalidatePersistImageCache("bg");
          state.backgroundImage = img;
          state.backgroundName = file.name;
          state.backgroundSourceLabel = t("ui.bg.localFileHint", { name: file.name });
          refreshBackgroundSourceLabel();
          renderWatchface();
          fontStore.log(t("log.backgroundLoaded", { name: file.name }));
          onLocalConfigEdited();
        };
        img.onerror = () => alert(t("alert.backgroundLoadFailed"));
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

    dom.btnClearBg.addEventListener("click", () => {
      clearBackgroundObjectUrl();
      invalidatePersistImageCache("bg");
      state.backgroundImage = null;
      state.backgroundName = "";
      state.backgroundSourceLabel = "";
      if (dom.inputBgFile) dom.inputBgFile.value = "";
      refreshBackgroundSourceLabel();
      renderWatchface();
      onLocalConfigEdited();
    });

    if (dom.inputAppPreviewFile) {
      dom.inputAppPreviewFile.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (alertIfLocalPickFileTooLarge(file)) {
          dom.inputAppPreviewFile.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            clearAppPreviewObjectUrl();
            invalidatePersistImageCache("appPreview");
            state.appPreviewImage = img;
            state.appPreviewName = file.name;
            state.appPreviewSourceLabel = t("ui.appPreview.localFileHint", { name: file.name });
            if (state.config && typeof state.config === "object") {
              state.config.AppImageUrl = file.name;
            }
            refreshAppPreviewSourceLabel();
            fontStore.log(t("log.appPreviewLoaded", { name: file.name }));
            onLocalConfigEdited();
          };
          img.onerror = () => alert(t("alert.appPreviewLoadFailed"));
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });
    }

    if (dom.btnClearAppPreview) {
      dom.btnClearAppPreview.addEventListener("click", () => {
        clearAppPreviewState();
        onLocalConfigEdited();
      });
    }

    const onWatchDescInput = () => {
      if (!state.config || typeof state.config !== "object") return;
      if (dom.txtDescCn) state.config.DescCn = dom.txtDescCn.value;
      if (dom.txtDescEn) state.config.DescEn = dom.txtDescEn.value;
      onLocalConfigEdited();
    };
    if (dom.txtDescCn) dom.txtDescCn.addEventListener("input", onWatchDescInput);
    if (dom.txtDescEn) dom.txtDescEn.addEventListener("input", onWatchDescInput);

    if (dom.inputFontFilter) {
      dom.inputFontFilter.addEventListener("input", refreshBuiltinFontList);
    }
    if (dom.selectFontPreview) {
      dom.selectFontPreview.addEventListener("change", () => {
        refreshBuiltinFontList();
        renderFontPreview();
      });
    }
    if (dom.inputFontPreviewText) {
      dom.inputFontPreviewText.addEventListener("input", renderFontPreview);
    }

    if (dom.selectLang) {
      dom.selectLang.addEventListener("change", () => {
        applyLanguage(dom.selectLang.value, true);
      });
    }

    dom.btnAddItem.addEventListener("click", onAddItem);
    dom.btnDupItem.addEventListener("click", onDupItem);
    dom.btnDelItem.addEventListener("click", onDeleteItem);
    dom.btnItemUp.addEventListener("click", () => moveItem(-1));
    dom.btnItemDown.addEventListener("click", () => moveItem(1));

    if (dom.btnDismissFileBanner && dom.fileProtocolBanner) {
      dom.btnDismissFileBanner.addEventListener("click", () => {
        dom.fileProtocolBanner.hidden = true;
      });
    }

    wireLanDeviceUi();
    wireLanUi();
    wireTemplateSyncUi();
    wireFontSyncUi();
  }

  async function warnIfFileProtocolBlocked() {
    if (location.protocol !== "file:") return;
    try {
      const u = withBase("font/font_info.cfg");
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error("bad");
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) throw new Error("html");
      try {
        if (r.body?.cancel) await r.body.cancel();
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      if (dom.fileProtocolBanner) dom.fileProtocolBanner.hidden = false;
    }
  }

  async function init() {
    syncTemplateDomRefs();
    currentLanguageEnum = resolveInitialLanguageEnum();
    setLanguage(currentLanguageEnum, false);
    currentLanguageEnum = getLanguage();
    rebuildLanguageSelector();
    applyStaticI18n();
    rebuildTemplateClassifyRows();

    bindEvents();
    ensurePreviewStageResizeObserver();
    void refreshLanDeviceListUi({ silent: true });
    applyCanvasZoom();
    refreshFontPreviewSelect();
    refreshTemplateListUi();
    fontStore.log(t("log.uiBuildVersion", { version: APP_BUILD_NUMBER }));
    refreshBackgroundSourceLabel();
    refreshAppPreviewSourceLabel();
    refreshWatchDescFields();
    loadPhotoAlbumDemoImages();

    await ensureBundledStarterWatchfaceIfLibraryEmpty();

    const lastId = getLastActiveId();
    const rec = lastId ? getWatchface(lastId) : null;
    if (rec) {
      activeLocalWatchfaceId = lastId;
      await restoreWorkspaceFromRecord(rec);
      namingPromptDismissed = true;
    } else {
      activeLocalWatchfaceId = "";
      applyConfig(
        {
          ClockId: 0,
          NameCn: t("ui.default.untitled"),
          NameEn: "Untitled",
          ItemList: [createDefaultItem(0)]
        },
        t("source.init")
      );
      namingPromptDismissed = false;
      syncWorkspaceBaseline();
    }
    refreshLocalWatchfaceListUi();
    sidebarBrowseMode = "local";
    refreshSidebarBrowseChrome();

    if (state.tickHandle) clearInterval(state.tickHandle);
    state.tickHandle = setInterval(() => renderWatchface(), PREVIEW_TICK_MS);
    window.addEventListener("beforeunload", (e) => {
      if (isWorkspaceDirtyUnsaved()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    window.addEventListener(
      "beforeunload",
      () => {
        clearAllLocalDispAssets();
        clearBackgroundObjectUrl();
      },
      { once: true }
    );
    loadDefaultFontConfigs();
    await loadDispInfoCfg();
    await loadTemplateClassifyCache();
    await loadTemplateConfigIds();
    await initPendingTemplateOnStartup();
    await initPendingFontsOnStartup();
    refreshTemplateSyncUi();
    void warnIfFileProtocolBlocked();
  }

function boot() {
  void init().catch((err) => {
    console.error("[watchface-editor] init failed:", err);
    try {
      syncTemplateDomRefs();
      const hint = dom.templateHint || byId("template-hint");
      if (hint) {
        hint.textContent = String(err?.message || err || "init failed");
      }
    } catch (e) {
      /* ignore */
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
