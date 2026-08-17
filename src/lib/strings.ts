import type { Lang, TeamId } from "./types";
import { ordinalsFor } from "./arabic";

export type { Lang };

export interface Strings {
  title: string;
  tagline: string;
  tagline2: string;
  team: Record<TeamId, string>;
  you: string;
  youAre: string;
  host: string;
  breach: string;
  fault: string;
  qmark: string;
  empty: string;
  ordinals: readonly [string, string, string];

  /* home */
  yourName: string;
  namePh: string;
  openRoom: string;
  creating: string;
  orJoin: string;
  join: string;
  joining: string;
  everyonePhone: string;
  pickLang: string;
  pickLangHint: string;
  arCta: string;
  enCta: string;
  back: string;
  invitedTo: string;
  joinCta: string;
  otherRoom: string;

  /* lobby */
  roomCode: string;
  share: string;
  copied: string;
  showQr: string;
  hideQr: string;
  scanToJoin: string;
  noTeam: string;
  kick: string;
  shuffle: string;
  joinSide: string;
  leaveSide: string;
  orders: string;
  hostOnly: string;
  timer: string;
  timerOn: string;
  timerOff: string;
  encryptTime: string;
  guessTime: string;
  sec: string;
  rounds: string;
  start: string;
  waitingHost: string;
  waitingTeams: string;
  leave: string;
  leaveConfirm: string;
  shareText: (id: string, url: string) => string;
  readyOk: string;
  idleOne: string;
  idleMany: (n: number) => string;
  shortBoth: (a: string, b: string) => string;
  needsTwo: (side: string) => string;
  goldShort: (n: number) => string;
  silverShort: (n: number) => string;

  /* chrome */
  tabPlay: string;
  tabLog: string;
  tabTeam: string;
  paused: string;
  pausedClock: string;
  roundN: (n: number) => string;
  showdown: string;
  tieShowdown: string;
  loadingKeys: string;
  secretKeys: string;
  hide: string;
  outOfTeamsTitle: string;
  outOfTeamsBody: string;
  authFail: string;
  oneSec: string;
  roomGone: string;
  roomGoneBody: string;

  /* keys */
  yourFourKeys: string;
  wontChange: string;
  formKy1: string;
  classified: string;
  crewSigns: string;
  destroyAfter: string;
  secretStamp: string;
  hostOrders: string;
  changeKeys: (team: string) => string;
  change: string;
  withoutShowing: string;
  startEncrypt: string;

  /* encrypt */
  cluesSent: string;
  waitOtherEncryptor: string;
  drawingCode: string;
  cluePh: string;
  sendClues: string;
  sending: string;
  finishThree: string;
  isYourKeyword: string;
  usedBefore: string;
  duplicate: string;
  noSpelling: string;
  pastClues: string;
  close: string;
  previous: string;
  yourClueLog: string;
  waitingEncryptors: string;
  encryptorsAria: string;
  ready: string;
  writing: string;
  enemyLog: string;
  addGuesses: string;
  yourLog: string;
  reviewPast: string;
  firstRound: string;
  noLogYet: string;
  morePastAria: (n: number) => string;

  /* guess */
  noCluesTitle: string;
  noCluesBody: string;
  decryptFrom: string;
  interceptFrom: string;
  encryptorLocked: string;
  sentLocked: string;
  waitingTeam: string;
  anyoneCanMove: string;
  sentByWaiting: (name: string) => string;
  sendDecrypt: string;
  sendIntercept: string;
  anyoneCanSend: string;
  completeThree: string;
  logYours: string;
  logOf: (team: string) => string;
  watchOnly: string;
  yourTeamDecrypts: (team: string) => string;
  theyDecrypt: string;
  enemyIntercepts: (team: string) => string;
  theyInterceptLive: string;
  interceptSentBy: (name: string) => string;
  watchingNumbers: string;
  waitingDecrypt: string;
  clear: string;
  slotEmpty: string;
  slotFilled: (ord: string, n: number) => string;

  /* reveal */
  revealing: string;
  continue: string;
  cipherOf: (team: string) => string;
  yourTeam: string;
  trueCode: string;
  noCluesWarn: string;
  roundResults: string;
  theyBreachedYou: (team: string) => string;
  youBreachedThem: (team: string) => string;
  youFaulted: string;
  theyFaulted: (team: string) => string;
  decryptOf: (team: string) => string;
  interceptOf: (team: string) => string;
  markOk: string;
  markBad: string;

  /* round end */
  tiebreakTitle: string;
  whyMixed: string;
  whyBothBreach: string;
  whyBothFault: string;
  whyLastRound: string;
  pointsTiedFallback: string;
  pointsTiedSo: (a: number, b: number) => string;
  eachGuessesFour: string;
  roundsLabel: string;
  nextEncryptors: string;
  showdownDuel: string;
  leftScreen: string;
  finalResult: string;
  showdownTitle: string;
  nextRound: string;
  twoBreachWin: string;
  pointsLine: (gold: string, gp: number, silver: string, sp: number) => string;
  youTag: string;

  /* showdown */
  showdownBanner: (n: number) => string;
  showdownTime: string;
  opponentWord: string;
  guessSent: string;
  waitingOther: string;
  sendGuess: string;

  /* log / team */
  ourLog: string;
  enemyLogTab: string;
  whatYouSaid: string;
  sharedGuesses: string;
  byNumber: string;
  byRound: string;
  emptyLog: string;
  fillsAfter: string;
  roundNShort: (n: number) => string;
  noClues: string;
  yourTeamLabel: string;
  encryptorThisRound: string;
  howScore: string;
  breachExplain: string;
  faultExplain: string;
  decryptNothing: string;
  hostControl: string;
  resume: string;
  pause: string;
  skipContinue: string;
  endGameLobby: string;

  /* over */
  formEnd1: string;
  closedDraw: string;
  closed: string;
  winnerMark: string;
  drawMark: string;
  winnerAria: (team: string) => string;
  decidedByPoints: string;
  decidedShowdown: string;
  decidedTime: string;
  shameList: (team: string) => string;
  silent: string;
  roundTitle: (n: number) => string;
  showdownReveal: string;
  tally: string;
  time: string;
  declassified: string;
  declassifiedSub: string;
  fullLog: string;
  newGame: string;
  waitingHostShort: string;

  /* sheets */
  formLg4: string;
  logTitle: (team: string) => string;
  noWatches: string;
  watchGutter: string;
  unusedRound: (n: number) => string;
  usedRound: (n: number, text: string) => string;
  endOfLog: string;
  topSecret: string;
  guessWordN: (n: number | string) => string;
  guessPh: string;

  err: {
    signIn: string;
    writeName: string;
    noSuchRoom: string;
    createFailed: string;
    roomFull: string;
    teamsFull: string;
    unknownTeam: string;
    switchPlay: string;
    notInRoom: string;
    shuffleLobby: string;
    kickSelf: string;
    playerGone: string;
    gameOver: string;
    hostKick: string;
    settingsLobby: string;
    gameStarted: string;
    needTwo: string;
    shuffleKeysPhase: string;
    roomMissing: string;
    writeThree: string;
    emptyClue: string;
    notEncryptPhase: string;
    notEncryptor: string;
    noTeamData: string;
    clueIsKeyword: (i: number) => string;
    cluesDup: string;
    clueUsed: (c: string) => string;
    notOnTeam: string;
    timeLeft: string;
    unknownAction: string;
    notOver: string;
    hostOnly: string;
    permission: string;
    generic: string;
  };
}

const AR: Strings = {
  title: "تشفير",
  tagline: "مرّروا شفرتكم لفريقكم دون أن يلتقطها الخصم.",
  tagline2: "فريقان، أربع كلمات سرية لكل فريق، وثمانِ جولات.",
  team: { gold: "الحلفاء", silver: "المحور" },
  you: "أنت",
  youAre: "أنت",
  host: "مضيف",
  breach: "اختراق",
  fault: "خلل",
  qmark: "؟",
  empty: "—",
  ordinals: ordinalsFor("ar"),

  yourName: "اسمك",
  namePh: "سعد بن صالح",
  openRoom: "أنشئ غرفة",
  creating: "جارٍ الإنشاء…",
  orJoin: "أو انضم بغرفة قائمة — حتى أثناء اللعب",
  join: "انضم",
  joining: "…",
  everyonePhone: "كل لاعب على جواله",
  pickLang: "اختر لغة الغرفة · Pick the room language",
  pickLangHint: "الكلمات والشاشات كلها بهذه اللغة · Keywords and screens both follow it",
  arCta: "تشفير · عربي",
  enCta: "Cipher · English",
  back: "رجوع · Back",
  invitedTo: "دُعيت إلى",
  joinCta: "ادخل",
  otherRoom: "غرفة أخرى",

  roomCode: "رمز الغرفة",
  share: "مشاركة",
  copied: "نُسخ الرابط",
  showQr: "رمز QR",
  hideQr: "إخفاء الرمز",
  scanToJoin: "امسح للدخول",
  noTeam: "بلا فريق",
  kick: "إخراج",
  shuffle: "اخلط الفرق",
  joinSide: "انضم",
  leaveSide: "خروج",
  orders: "أوامر التشغيل",
  hostOnly: "المضيف فقط",
  timer: "المؤقت",
  timerOn: "تشغيل",
  timerOff: "إيقاف",
  encryptTime: "وقت كتابة التلميحات",
  guessTime: "وقت الفكّ والاعتراض",
  sec: "ث",
  rounds: "عدد الجولات",
  start: "ابدأ اللعبة",
  waitingHost: "بانتظار المضيف ليبدأ…",
  waitingTeams: "بانتظار اكتمال الفريقين…",
  leave: "مغادرة الغرفة",
  leaveConfirm: "مغادرة الغرفة؟ إن كنت آخر لاعب تُحذف الغرفة.",
  shareText: (id, url) => `انضم إلى غرفتي في تشفير\nالرمز: ${id}\n${url}`,
  readyOk: "الجاهزية مكتملة — يمكن البدء",
  idleOne: "لا يزال لاعب بلا فريق",
  idleMany: (n) => `${n} لاعبون بلا فريق`,
  shortBoth: (a, b) => `${a} و${b} ناقصان`,
  needsTwo: (side) => `${side} يحتاج لاعبَين على الأقل`,
  goldShort: (n) => `الحلفاء (${n}/2)`,
  silverShort: (n) => `المحور (${n}/2)`,

  tabPlay: "اللعب",
  tabLog: "السجل",
  tabTeam: "الفريق",
  paused: "أوقف المضيف اللعبة مؤقتًا.",
  pausedClock: "إيقاف",
  roundN: (n) => `الجولة ${n}`,
  showdown: "المواجهة",
  tieShowdown: "تعادل · مواجهة",
  loadingKeys: "جارٍ تحميل مفاتيحكم…",
  secretKeys: "مفاتيحكم السرية",
  hide: "إخفاء",
  outOfTeamsTitle: "أنت خارج الفريقين",
  outOfTeamsBody: "بدأت اللعبة بدونك. انتظر انتهاءها أو اطلب من المضيف إعادة التوزيع.",
  authFail: "تعذّر الاتصال. تحقّق من الشبكة.",
  oneSec: "…",
  roomGone: "الغرفة انتهت",
  roomGoneBody: "إمّا خرج آخر لاعب، أو الرمز غير صحيح.",

  yourFourKeys: "مفاتيحكم الأربعة",
  wontChange: "لن تتغيّر طوال اللعبة.",
  formKy1: "مف-1",
  classified: "سري",
  crewSigns: "الطاقم",
  destroyAfter: "يُتلف بعد اللعب",
  secretStamp: "سري",
  hostOrders: "أوامر المضيف",
  changeKeys: (team) => `تغيير مفاتيح ${team}`,
  change: "تغيير",
  withoutShowing: "بدون عرض كلماتهم",
  startEncrypt: "بدء التشفير",

  cluesSent: "أُرسلت تلميحاتك",
  waitOtherEncryptor: "بانتظار المُشفِّر الآخر. لا تلمّح لأحد بشيء.",
  drawingCode: "جارٍ سحب الشفرة…",
  cluePh: "تلميح",
  sendClues: "أرسل التلميحات",
  sending: "جارٍ الإرسال…",
  finishThree: "أكمل التلميحات الثلاثة",
  isYourKeyword: "هذه إحدى كلماتكم",
  usedBefore: "استُخدم في جولة سابقة",
  duplicate: "مكرر",
  noSpelling: "ممنوع التلميح للهجاء أو عدد الحروف أو الترتيب.",
  pastClues: "تلميحات سابقة",
  close: "إغلاق",
  previous: "السابق",
  yourClueLog: "سجل تلميحاتكم",
  waitingEncryptors: "بانتظار المشفّرين",
  encryptorsAria: "المُشفِّران",
  ready: "جاهز",
  writing: "يكتب",
  enemyLog: "سجل العدو",
  addGuesses: "أضيفوا تخميناتكم لكلماتهم",
  yourLog: "سجل فريقكم",
  reviewPast: "راجعوا تلميحاتكم السابقة — الخصم يحفظها كلها",
  firstRound: "الجولة الأولى",
  noLogYet: "لا سجلّ بعد. في هذه الجولة لا اعتراض على أحد.",
  morePastAria: (n) => `عرض ${n} تلميحات سابقة إضافية`,

  noCluesTitle: "لم تُعطَ تلميحات",
  noCluesBody: "مُشفِّركم لم يقدّم تلميحات — سوء تفاهم. لا اعتراض، واللعبة تتجاوز فكّ الشفرة لهذا الفريق.",
  decryptFrom: "فكّوا شفرة فريقكم من:",
  interceptFrom: "اعترضوا شفرة العدو من:",
  encryptorLocked: "أنت كتبت هذه التلميحات. لا تشارك في الفكّ ولا تُظهر أي ردّ فعل.",
  sentLocked: "أُرسلت — لا يمكن التعديل",
  waitingTeam: "بانتظار فريقك…",
  anyoneCanMove: "أي لاعب في فريقكم يستطيع تحريك الأرقام — الجميع يرى نفس الشاشة",
  sentByWaiting: (name) => `أرسلها ${name} — بانتظار الطرف الآخر`,
  sendDecrypt: "أرسل فكّ الشفرة",
  sendIntercept: "أرسل الاعتراض",
  anyoneCanSend: "أي لاعب في الفريق يستطيع الإرسال — وبعدها تُقفل الأرقام",
  completeThree: "أكملوا الأرقام الثلاثة قبل الإرسال",
  logYours: "سجلّكم",
  logOf: (team) => `سجلّ ${team}`,
  watchOnly: "راقب فقط — لا تُظهر ردّ فعل",
  yourTeamDecrypts: (team) => `فريقكم: ${team}`,
  theyDecrypt: "يفكّون شفرتكم",
  enemyIntercepts: (team) => `العدو: ${team}`,
  theyInterceptLive: "يعترضون · مباشر",
  interceptSentBy: (name) => `أرسل الاعتراض ${name}`,
  watchingNumbers: "تشاهدون أرقامهم وهي تتحرّك",
  waitingDecrypt: "بانتظار فريقك ليفكّ الشفرة…",
  clear: "مسح",
  slotEmpty: "فارغ",
  slotFilled: (ord, n) => `${ord}: ${n}`,

  revealing: "جارٍ الكشف…",
  continue: "متابعة",
  cipherOf: (team) => `شفرة ${team}`,
  yourTeam: "فريقكم",
  trueCode: "الشفرة الحقيقية",
  noCluesWarn: "لم يقدّم المُشفِّر تلميحات — سوء تفاهم (خلل). لا اعتراض.",
  roundResults: "نتائج الجولة",
  theyBreachedYou: (team) => `اخترقكم ${team}`,
  youBreachedThem: (team) => `اخترقتم ${team}`,
  youFaulted: "خلل — أخطأتم",
  theyFaulted: (team) => `خلل — ${team}`,
  decryptOf: (team) => `فكّ ${team}`,
  interceptOf: (team) => `اعتراض ${team}`,
  markOk: "صحيح",
  markBad: "خطأ",

  tiebreakTitle: "يلزم كسر التعادل — مواجهة الكلمات",
  whyMixed: "فريق وصل إلى اختراقين وخللين في آن واحد (فوز وخسارة معًا).",
  whyBothBreach: "الفريقان حققا اختراقهما الثاني في نفس الجولة.",
  whyBothFault: "الفريقان وقعا في خللهما الثاني في نفس الجولة.",
  whyLastRound: "انتهت الجولات دون فوز أو خسارة حاسمة، والنقاط متعادلة.",
  pointsTiedFallback: "النقاط متعادلة بعد حسم الجولة.",
  pointsTiedSo: (a, b) => `النقاط متعادلة (${a} — ${b})، لذلك يخمن كل فريق كلمات الخصم الأربع.`,
  eachGuessesFour: "يخمن كل فريق كلمات الخصم الأربع — الأكثر إصابة يفوز.",
  roundsLabel: "الجولات",
  nextEncryptors: "المُشفِّران القادمان",
  showdownDuel: "المواجهة الحاسمة",
  leftScreen: "من غادر الشاشة هذه الجولة",
  finalResult: "النتيجة النهائية",
  showdownTitle: "المواجهة الحاسمة",
  nextRound: "الجولة التالية",
  twoBreachWin: "اختراقان يفوزان باللعبة. خللان يخسرانها.",
  pointsLine: (gold, gp, silver, sp) =>
    `النقاط: ${gold} ${gp} · ${silver} ${sp} (اختراق +1، خلل −1)`,
  youTag: "أنت",

  showdownBanner: (n) =>
    `تعادل بعد ${n} جولات. اكتبوا كلمات الخصم الأربع — الأكثر إصابة يفوز.`,
  showdownTime: "عند التساوي يفوز الأسرع عبر الجولات (تشفير وفك).",
  opponentWord: "كلمة الخصم",
  guessSent: "أُرسل تخمينكم",
  waitingOther: "بانتظار الفريق الآخر…",
  sendGuess: "إرسال التخمين",

  ourLog: "سجلنا",
  enemyLogTab: "سجل العدو",
  whatYouSaid: "ما قلتموه عن كل مفتاح",
  sharedGuesses: "تخميناتكم لكل رقم · مشتركة بين الفريق",
  byNumber: "حسب الرقم",
  byRound: "حسب الجولة",
  emptyLog: "السجل فارغ",
  fillsAfter: "يمتلئ بعد أول كشف.",
  roundNShort: (n) => `الجولة ${n}`,
  noClues: "لا تلميحات",
  yourTeamLabel: "فريقك",
  encryptorThisRound: "مُشفِّر هذه الجولة",
  howScore: "كيف تُحسب النتيجة",
  breachExplain: "اختراق — التقطتم شفرة الخصم. اختراقان يفوزان.",
  faultExplain: "خلل — فريقكم أخطأ في فهم مُشفِّركم. خللان يخسران.",
  decryptNothing: "أن يفهمكم فريقكم لا يمنحكم شيئًا — يمنعكم فقط من الخسارة.",
  hostControl: "تحكّم المضيف",
  resume: "استئناف",
  pause: "إيقاف",
  skipContinue: "تخطٍّ / متابعة",
  endGameLobby: "إنهاء اللعبة والعودة للردهة",

  formEnd1: "خت-1",
  closedDraw: "مغلق · تعادل",
  closed: "مغلق",
  winnerMark: "فـائـز",
  drawMark: "تعادل",
  winnerAria: (team) => `فائز: ${team}`,
  decidedByPoints: "حُسمت بفارق النقاط",
  decidedShowdown: "حُسمت بمواجهة الكلمات بعد تعادل النقاط",
  decidedTime: "تعادل في الكلمات — حُسمت بالوقت الأقل عبر الجولات",
  shameList: (team) => `لائحة النكبات · ${team}`,
  silent: "صمت",
  roundTitle: (n) => `الجولة ${n}`,
  showdownReveal: "كشف المواجهة",
  tally: "الحصيلة",
  time: "الوقت",
  declassified: "رُفعت",
  declassifiedSub: "السرية",
  fullLog: "السجل الكامل",
  newGame: "لعبة جديدة",
  waitingHostShort: "بانتظار المضيف…",

  formLg4: "سج-4",
  logTitle: (team) => `سجل ${team}`,
  noWatches: "لا مراقبات بعد",
  watchGutter: "و",
  unusedRound: (n) => `جولة ${n}: غير مستخدم`,
  usedRound: (n, text) => `جولة ${n}: ${text}`,
  endOfLog: "نهاية السجل",
  topSecret: "سري",
  guessWordN: (n) => `تخمين الكلمة ${n}`,
  guessPh: "—",

  err: {
    signIn: "سجّل الدخول أولًا.",
    writeName: "اكتب اسمك.",
    noSuchRoom: "لا توجد غرفة بهذا الرمز.",
    createFailed: "تعذّر إنشاء الغرفة. حاول مرة أخرى.",
    roomFull: "الغرفة ممتلئة.",
    teamsFull: "كلا الفريقين مكتملان (4 لاعبين).",
    unknownTeam: "فريق غير معروف.",
    switchPlay: "لا يمكن تغيير الفريق أثناء اللعب.",
    notInRoom: "لست في هذه الغرفة.",
    shuffleLobby: "الفرق تُوزَّع قبل البدء.",
    kickSelf: "لا يمكنك إخراج نفسك.",
    playerGone: "اللاعب ليس في الغرفة.",
    gameOver: "انتهت اللعبة.",
    hostKick: "المضيف فقط يخرج اللاعبين.",
    settingsLobby: "الإعدادات تُضبط قبل البدء.",
    gameStarted: "اللعبة بدأت بالفعل.",
    needTwo: "تحتاج لاعبَين على الأقل في كل فريق.",
    shuffleKeysPhase: "خلط المفاتيح قبل بدء التشفير فقط.",
    roomMissing: "الغرفة غير موجودة.",
    writeThree: "اكتب التلميحات الثلاثة.",
    emptyClue: "لا تترك تلميحًا فارغًا.",
    notEncryptPhase: "ليست مرحلة كتابة التلميحات.",
    notEncryptor: "أنت لست المُشفِّر في هذه الجولة.",
    noTeamData: "بيانات الفريق غير متاحة.",
    clueIsKeyword: (i) => `التلميح ${i} هو إحدى كلماتكم. اختر غيره.`,
    cluesDup: "التلميحات الثلاثة متطابقة أو مكررة.",
    clueUsed: (c) => `استخدمتم "${c}" في جولة سابقة.`,
    notOnTeam: "لست في فريق.",
    timeLeft: "لم ينتهِ الوقت بعد.",
    unknownAction: "أمر غير معروف.",
    notOver: "اللعبة لم تنتهِ بعد.",
    hostOnly: "هذا التحكم للمضيف فقط.",
    permission: "لا صلاحية لهذا الإجراء. حدّث الصفحة وحاول مرة أخرى.",
    generic: "حدث خطأ. حاول مرة أخرى.",
  },
};

const EN: Strings = {
  title: "Cipher",
  tagline: "Pass your code to your team without the other side intercepting it.",
  tagline2: "Two teams, four secret keywords each, eight rounds.",
  team: { gold: "Allies", silver: "Axis" },
  you: "you",
  youAre: "you",
  host: "host",
  breach: "Breach",
  fault: "Fault",
  qmark: "?",
  empty: "—",
  ordinals: ordinalsFor("en"),

  yourName: "Your name",
  namePh: "e.g. Sam Carter",
  openRoom: "Open a room",
  creating: "Opening…",
  orJoin: "Or join an existing room — even mid-game",
  join: "Join",
  joining: "…",
  everyonePhone: "everyone on their own phone",
  pickLang: "اختر لغة الغرفة · Pick the room language",
  pickLangHint: "الكلمات والشاشات كلها بهذه اللغة · Keywords and screens both follow it",
  arCta: "تشفير · عربي",
  enCta: "Cipher · English",
  back: "رجوع · Back",
  invitedTo: "You're invited to",
  joinCta: "Join",
  otherRoom: "Different room",

  roomCode: "Room code",
  share: "Share",
  copied: "Link copied",
  showQr: "QR code",
  hideQr: "Hide code",
  scanToJoin: "Scan to join",
  noTeam: "No team",
  kick: "Kick",
  shuffle: "Shuffle teams",
  joinSide: "Join",
  leaveSide: "Leave",
  orders: "Standing orders",
  hostOnly: "Host only",
  timer: "Timer",
  timerOn: "On",
  timerOff: "Off",
  encryptTime: "Time to write clues",
  guessTime: "Time to decrypt & intercept",
  sec: "s",
  rounds: "Rounds",
  start: "Start the game",
  waitingHost: "Waiting for the host to begin…",
  waitingTeams: "Waiting for both teams to fill…",
  leave: "Leave room",
  leaveConfirm: "Leave the room? If you're the last player, the room is deleted.",
  shareText: (id, url) => `Join my Cipher room\nCode: ${id}\n${url}`,
  readyOk: "Ready — you can start",
  idleOne: "One player still has no team",
  idleMany: (n) => `${n} players still have no team`,
  shortBoth: (a, b) => `${a} and ${b} are short`,
  needsTwo: (side) => `${side} needs at least two players`,
  goldShort: (n) => `Allies (${n}/2)`,
  silverShort: (n) => `Axis (${n}/2)`,

  tabPlay: "Play",
  tabLog: "Log",
  tabTeam: "Team",
  paused: "The host paused the game.",
  pausedClock: "paused",
  roundN: (n) => `Round ${n}`,
  showdown: "Showdown",
  tieShowdown: "Tie · Showdown",
  loadingKeys: "Loading your keywords…",
  secretKeys: "Your secret keywords",
  hide: "Hide",
  outOfTeamsTitle: "You're on neither team",
  outOfTeamsBody: "The game started without you. Wait it out, or ask the host to reseat.",
  authFail: "Couldn't connect. Check the network.",
  oneSec: "…",
  roomGone: "Room's gone",
  roomGoneBody: "Last player left, or the code is wrong.",

  yourFourKeys: "Your four keywords",
  wontChange: "They stay the same the whole game.",
  formKy1: "KY-1",
  classified: "SECRET",
  crewSigns: "Crew",
  destroyAfter: "Destroy after",
  secretStamp: "SECRET",
  hostOrders: "Host orders",
  changeKeys: (team) => `Reroll ${team} keywords`,
  change: "Reroll",
  withoutShowing: "without showing their words",
  startEncrypt: "Start encrypting",

  cluesSent: "Clues sent",
  waitOtherEncryptor: "Waiting for the other encryptor. Don't hint at anything.",
  drawingCode: "Drawing the code…",
  cluePh: "clue",
  sendClues: "Send clues",
  sending: "Sending…",
  finishThree: "Fill in all three clues",
  isYourKeyword: "That's one of your keywords",
  usedBefore: "Used in a previous round",
  duplicate: "Duplicate",
  noSpelling: "No hints about spelling, letter count, or order.",
  pastClues: "Earlier clues",
  close: "Close",
  previous: "earlier",
  yourClueLog: "Your clue log",
  waitingEncryptors: "Waiting for the encryptors",
  encryptorsAria: "The two encryptors",
  ready: "ready",
  writing: "writing",
  enemyLog: "Enemy log",
  addGuesses: "Add your guesses for their words",
  yourLog: "Your team's log",
  reviewPast: "Review your past clues — the other side is keeping them all",
  firstRound: "Round one",
  noLogYet: "Nothing logged yet. No interception this round.",
  morePastAria: (n) => `Show ${n} more earlier clues`,

  noCluesTitle: "No clues given",
  noCluesBody: "Your encryptor sent nothing — a miscommunication. No intercept; this team's decrypt is skipped.",
  decryptFrom: "Decrypt your team's code from:",
  interceptFrom: "Intercept the enemy code from:",
  encryptorLocked: "You wrote these clues. Don't decrypt, and don't react.",
  sentLocked: "Sent — locked",
  waitingTeam: "Waiting for your team…",
  anyoneCanMove: "Any teammate can move the digits — everyone sees the same screen",
  sentByWaiting: (name) => `${name} sent it — waiting on the other side`,
  sendDecrypt: "Send decrypt",
  sendIntercept: "Send intercept",
  anyoneCanSend: "Any teammate can send — then the digits lock",
  completeThree: "Fill all three digits before sending",
  logYours: "Your log",
  logOf: (team) => `${team} log`,
  watchOnly: "Watch only — don't react",
  yourTeamDecrypts: (team) => `Your team: ${team}`,
  theyDecrypt: "decrypting your code",
  enemyIntercepts: (team) => `Enemy: ${team}`,
  theyInterceptLive: "intercepting · live",
  interceptSentBy: (name) => `${name} sent the intercept`,
  watchingNumbers: "You're watching their digits move",
  waitingDecrypt: "Waiting for your team to decrypt…",
  clear: "Clear",
  slotEmpty: "empty",
  slotFilled: (ord, n) => `${ord}: ${n}`,

  revealing: "Revealing…",
  continue: "Continue",
  cipherOf: (team) => `${team} code`,
  yourTeam: "your team",
  trueCode: "The real code",
  noCluesWarn: "The encryptor gave no clues — miscommunication (fault). No intercept.",
  roundResults: "Round results",
  theyBreachedYou: (team) => `${team} breached you`,
  youBreachedThem: (team) => `You breached ${team}`,
  youFaulted: "Fault — you missed",
  theyFaulted: (team) => `Fault — ${team}`,
  decryptOf: (team) => `${team} decrypt`,
  interceptOf: (team) => `${team} intercept`,
  markOk: "correct",
  markBad: "wrong",

  tiebreakTitle: "Tiebreak — keyword showdown",
  whyMixed: "A team hit two breaches and two faults at once (win and loss together).",
  whyBothBreach: "Both teams landed their second breach in the same round.",
  whyBothFault: "Both teams hit their second fault in the same round.",
  whyLastRound: "Rounds ran out with no decisive win or loss, and points are tied.",
  pointsTiedFallback: "Points are tied after the round.",
  pointsTiedSo: (a, b) => `Points are tied (${a} — ${b}), so each team names the other side's four words.`,
  eachGuessesFour: "Each team names the other side's four words — most hits wins.",
  roundsLabel: "Rounds",
  nextEncryptors: "Next encryptors",
  showdownDuel: "Keyword showdown",
  leftScreen: "Left the screen this round",
  finalResult: "Final result",
  showdownTitle: "Keyword showdown",
  nextRound: "Next round",
  twoBreachWin: "Two breaches win the game. Two faults lose it.",
  pointsLine: (gold, gp, silver, sp) =>
    `Points: ${gold} ${gp} · ${silver} ${sp} (breach +1, fault −1)`,
  youTag: "you",

  showdownBanner: (n) =>
    `Tied after ${n} rounds. Name the other side's four words — most hits wins.`,
  showdownTime: "On a hit-tie, the faster team across encrypt and decrypt wins.",
  opponentWord: "their word",
  guessSent: "Guess sent",
  waitingOther: "Waiting for the other team…",
  sendGuess: "Send guess",

  ourLog: "Our log",
  enemyLogTab: "Enemy log",
  whatYouSaid: "What you said about each keyword",
  sharedGuesses: "Your guesses per digit · shared with the team",
  byNumber: "By number",
  byRound: "By round",
  emptyLog: "Log is empty",
  fillsAfter: "It fills after the first reveal.",
  roundNShort: (n) => `Round ${n}`,
  noClues: "No clues",
  yourTeamLabel: "your team",
  encryptorThisRound: "encryptor this round",
  howScore: "How scoring works",
  breachExplain: "Breach — you caught their code. Two breaches win.",
  faultExplain: "Fault — your team misread your encryptor. Two faults lose.",
  decryptNothing: "Your team reading you correctly earns nothing — it only avoids the penalty.",
  hostControl: "Host controls",
  resume: "Resume",
  pause: "Pause",
  skipContinue: "Skip / continue",
  endGameLobby: "End game and return to lobby",

  formEnd1: "FN-1",
  closedDraw: "CLOSED · DRAW",
  closed: "CLOSED",
  winnerMark: "WINNER",
  drawMark: "DRAW",
  winnerAria: (team) => `Winner: ${team}`,
  decidedByPoints: "Decided on points",
  decidedShowdown: "Decided by keyword showdown after a points tie",
  decidedTime: "Keywords tied — decided by the lower time across rounds",
  shameList: (team) => `Casualty list · ${team}`,
  silent: "silent",
  roundTitle: (n) => `Round ${n}`,
  showdownReveal: "Showdown reveal",
  tally: "Tally",
  time: "Time",
  declassified: "lifted",
  declassifiedSub: "class.",
  fullLog: "Full log",
  newGame: "New game",
  waitingHostShort: "Waiting for the host…",

  formLg4: "LG-4",
  logTitle: (team) => `${team} log`,
  noWatches: "No watches yet",
  watchGutter: "R",
  unusedRound: (n) => `Round ${n}: unused`,
  usedRound: (n, text) => `Round ${n}: ${text}`,
  endOfLog: "End of log",
  topSecret: "SECRET",
  guessWordN: (n) => `Guess for word ${n}`,
  guessPh: "—",

  err: {
    signIn: "Sign in first.",
    writeName: "Enter your name.",
    noSuchRoom: "No room with that code.",
    createFailed: "Couldn't open a room. Try again.",
    roomFull: "The room is full.",
    teamsFull: "Both teams are full (4 players).",
    unknownTeam: "Unknown team.",
    switchPlay: "You can't switch teams mid-game.",
    notInRoom: "You're not in this room.",
    shuffleLobby: "Teams are seated before kickoff.",
    kickSelf: "You can't kick yourself.",
    playerGone: "That player isn't in the room.",
    gameOver: "The game is over.",
    hostKick: "Only the host can kick players.",
    settingsLobby: "Settings are set before kickoff.",
    gameStarted: "The game already started.",
    needTwo: "Each team needs at least two players.",
    shuffleKeysPhase: "Keyword reshuffle only before encrypting starts.",
    roomMissing: "The room doesn't exist.",
    writeThree: "Write all three clues.",
    emptyClue: "Don't leave a clue blank.",
    notEncryptPhase: "This isn't the clue-writing phase.",
    notEncryptor: "You're not the encryptor this round.",
    noTeamData: "Team data isn't available.",
    clueIsKeyword: (i) => `Clue ${i} is one of your keywords. Pick another.`,
    cluesDup: "The three clues match or repeat.",
    clueUsed: (c) => `You already used "${c}" in a previous round.`,
    notOnTeam: "You're not on a team.",
    timeLeft: "Time isn't up yet.",
    unknownAction: "Unknown command.",
    notOver: "The game isn't over yet.",
    hostOnly: "Only the host can do that.",
    permission: "You don't have permission for that. Refresh and try again.",
    generic: "Something went wrong. Try again.",
  },
};

export function S(lang: Lang | null | undefined): Strings {
  return lang === "en" ? EN : AR;
}

export function asLang(raw: unknown): Lang {
  return raw === "en" ? "en" : "ar";
}

export function joinUrl(roomId: string): string {
  const origin = typeof location === "undefined" ? "" : location.origin;
  return `${origin}/?r=${encodeURIComponent(roomId)}`;
}
