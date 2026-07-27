import { useEffect, useMemo, useState } from "react";
import { api, errText } from "../lib/firebase";
import { normalizeAr, normalizeKey, ORDINALS } from "../lib/arabic";
import type { AwayRecord, Draft, PlayerGuess, Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { Cartouche } from "../components/Cartouche";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Avatar, Banner, Btn, Empty, Stamp, TEAM_HEX, TEAM_LABEL } from "../components/ui";

interface Ctx {
  room: Room;
  uid: string;
  myTeam: TeamId;
  keys: string[] | null;
  usedClues: string[];
  rounds: RoundRecord[];
  draft: Draft | null;
  actions: {
    setCode: (f: "decrypt" | "intercept", values: (number | null)[]) => void;
    submit: (uid: string) => void;
  } | null;
  code: number[] | null;
  away: AwayRecord[];
  guesses: PlayerGuess[];
  setGuessWord: ((uid: string, n: string, text: string) => void) | null;
}

/* ================================================================== */
/* keys                                                               */
/* ================================================================== */

export function KeysPhase({ room, myTeam, keys }: Ctx) {
  const color = TEAM_HEX[myTeam];
  return (
    <div className="px-5 py-8 fade-in">
      <h2 className="font-display text-[20px] text-center mb-1.5">مفاتيحكم الأربعة</h2>
      <p className="text-[13px] text-muted text-center mb-7 leading-relaxed">
        لن تتغيّر طوال اللعبة. الخصم لا يراها — بعد.
      </p>
      <div className="space-y-2.5 max-w-sm mx-auto">
        {(keys ?? ["", "", "", ""]).map((k, i) => (
          <div
            key={i}
            className="card px-4 py-4 flex items-center gap-4 fade-in"
            style={{ borderColor: `${color}44`, animationDelay: `${i * 90}ms` }}
          >
            <span className="num font-display text-[30px] w-9 text-center" style={{ color }}>
              {i + 1}
            </span>
            <span className="text-[21px] font-display">{k || "…"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* encrypt                                                            */
/* ================================================================== */

export function EncryptPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, usedClues, code } = ctx;
  const amEncryptor = room.encryptor[myTeam] === uid;
  return amEncryptor ? <EncryptorView {...ctx} /> : <EncryptWaiting {...ctx} />;
}

function EncryptorView({ room, myTeam, keys, usedClues, code, rounds }: Ctx) {
  const [clues, setClues] = useState(["", "", ""]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const usedSet = useMemo(() => new Set(usedClues.map(normalizeAr)), [usedClues]);
  const keySet = useMemo(() => new Set((keys ?? []).map(normalizeKey)), [keys]);

  function problem(i: number): string | null {
    const raw = clues[i].trim();
    if (!raw) return null;
    if (keySet.has(normalizeKey(raw))) return "هذه إحدى كلماتكم";
    if (usedSet.has(normalizeAr(raw))) return "استُخدم في جولة سابقة";
    const dup = clues.findIndex((c, j) => j !== i && c.trim() && normalizeAr(c) === normalizeAr(raw));
    if (dup >= 0 && dup < i) return "مكرر";
    return null;
  }

  const filled = clues.every((c) => c.trim().length > 0);
  const clean = filled && [0, 1, 2].every((i) => !problem(i));

  async function send() {
    setBusy(true); setErr("");
    try {
      await api.submitClues({ roomId: room.id, clues: clues.map((c) => c.trim()) });
      setSent(true);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="px-5 py-8 fade-in">
        <Empty title="أُرسلت تلميحاتك" body="بانتظار المُشفِّر الآخر. لا تلمّح لأحد بشيء." />
        <div className="max-w-sm mx-auto mt-2 space-y-2">
          {clues.map((c, i) => (
            <div key={i} className="card px-4 py-3 flex items-center gap-3">
              <span className="text-[11px] text-muted w-10 shrink-0">{ORDINALS[i]}</span>
              <span className="text-[15px]">{c}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lanes = buildLanes(rounds, myTeam, keys);

  return (
    <div className="px-4 py-4 space-y-4 fade-in pb-8">
      <div>
        <p className="text-[12px] text-muted mb-2">شفرتك — اجعل فريقك يقولها</p>
        <Cartouche values={code ?? [null, null, null]} tone={myTeam} />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => {
          const target = code?.[i];
          const word = target && keys ? keys[target - 1] : null;
          const issue = problem(i);
          // Everything this team has already said about THIS keyword.
          // Without it the encryptor writes blind and repeats themselves.
          const past = target ? lanes[target - 1].clues : [];
          return (
            <div key={i}>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="text-[12px] text-muted">التلميح {ORDINALS[i]}</span>
                <span className="flex-1 h-px bg-line" />
                {word && (
                  <span className="chip !text-[12px]" style={{ borderColor: `${TEAM_HEX[myTeam]}55` }}>
                    <span className="num" style={{ color: TEAM_HEX[myTeam] }}>{target}</span>
                    {word}
                  </span>
                )}
              </div>

              {past.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 mb-2 px-0.5">
                  <span className="text-[10.5px] text-muted shrink-0">قلتم سابقًا</span>
                  {past.map((c, k) => (
                    <span key={k} className="chip !text-[11.5px] !py-0.5">
                      <span className="num text-[9.5px] text-muted">{c.round}</span>
                      {c.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10.5px] text-muted mb-2 px-0.5">لم تلمّحوا لهذه الكلمة بعد</p>
              )}

              <input
                value={clues[i]}
                maxLength={40}
                onChange={(e) => setClues((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder="كلمة أو عبارة"
                className="w-full bg-[#0C1330] rounded-xl px-3.5 py-3 text-[16px] text-parch
                           placeholder:text-[#4A5680] focus:outline-none transition border"
                style={{ borderColor: issue ? "#D6564A" : "#25335F" }}
              />
              {issue && <p className="text-[11.5px] text-alarm mt-1 px-1">{issue}</p>}
            </div>
          );
        })}
      </div>

      {err && <Banner tone="warn">{err}</Banner>}

      <Btn className="w-full" disabled={!clean || busy} onClick={send}>
        {busy ? "جارٍ الإرسال…" : "أرسل التلميحات"}
      </Btn>
      <p className="text-[11.5px] text-muted text-center leading-relaxed">
        ممنوع التلميح للهجاء أو عدد الحروف أو الترتيب على الشاشة.
      </p>

      <div>
        <SectionLine>سجلّ فريقكم كاملًا</SectionLine>
        <ClueGrid lanes={lanes} team={myTeam} />
      </div>
    </div>
  );
}

function EncryptWaiting({ room, myTeam, rounds, keys }: Ctx) {
  const mine = room.encryptor[myTeam];
  const lanes = buildLanes(rounds, myTeam, keys);

  return (
    <div className="px-4 py-5 space-y-5 fade-in">
      <div className="card p-5 text-center">
        <div className="flex justify-center mb-3">
          <Avatar
            n={mine ? room.players[mine]?.avatar ?? 0 : 0}
            size={44}
            team={myTeam}
          />
        </div>
        <p className="font-display text-[17px]">
          {mine ? room.players[mine]?.name : "المُشفِّر"} يكتب التلميحات
        </p>
        <div className="flex justify-center gap-4 mt-4">
          {TEAMS.map((t) => (
            <span key={t} className="chip">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: room.cluesIn[t] ? "#6FBF95" : "#4A5680" }}
              />
              {TEAM_LABEL[t]}
              <span className="text-muted">{room.cluesIn[t] ? "جاهز" : "يكتب…"}</span>
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] text-muted mb-2 px-1">
          راجعوا تلميحاتكم السابقة — الخصم يحفظها كلها
        </p>
        {rounds.length === 0 ? (
          <Empty title="الجولة الأولى" body="لا سجلّ بعد. في هذه الجولة لا اعتراض على أحد." />
        ) : (
          <ClueGrid lanes={lanes} team={myTeam} />
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* guess                                                              */
/* ================================================================== */

export function GuessPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, rounds, draft, actions, guesses, setGuessWord } = ctx;
  const theirTeam = OTHER[myTeam];
  const amEncryptor = room.encryptor[myTeam] === uid;
  const canIntercept = room.round >= 2;

  const [tab, setTab] = useState<"ours" | "theirs">(amEncryptor && canIntercept ? "theirs" : "ours");
  const [err, setErr] = useState("");

  const ourClues = room.clues[myTeam] ?? [];
  const theirClues = room.clues[theirTeam] ?? [];

  const sentBy = draft?.submitted ?? null;
  const sent = Boolean(sentBy);
  const complete =
    (draft?.decrypt ?? []).every((v) => v != null) &&
    (!canIntercept || (draft?.intercept ?? []).every((v) => v != null));
  const names = Object.fromEntries(
    Object.entries(room.players).map(([u, p]) => [u, p.name])
  );

  const ourLanes = buildLanes(rounds, myTeam, keys);
  const theirLanes = buildLanes(rounds, theirTeam, null);

  return (
    <div className="pb-28">
      <div className="sticky z-10 bg-ink/95 backdrop-blur-sm px-4 py-2.5"
           style={{ top: "calc(var(--safe-t) + 118px)" }}>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0C1330] border border-line">
          <TabBtn on={tab === "ours"} onClick={() => setTab("ours")} color={TEAM_HEX[myTeam]}>
            شفرتنا
          </TabBtn>
          <TabBtn
            on={tab === "theirs"}
            onClick={() => canIntercept && setTab("theirs")}
            color={TEAM_HEX[theirTeam]}
            disabled={!canIntercept}
          >
            اعتراض
          </TabBtn>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-4 fade-in" key={tab}>
        {tab === "ours" ? (
          <>
            {amEncryptor && (
              <Banner tone="lock">
                أنت كتبت هذه التلميحات. لا تشارك في الفكّ ولا تُظهر أي ردّ فعل.
              </Banner>
            )}
            {ourClues.length !== 3 ? (
              <Banner tone="warn">لم يصل أي تلميح من فريقكم هذه الجولة.</Banner>
            ) : null}
            <Cartouche
              values={draft?.decrypt ?? [null, null, null]}
              clues={ourClues.length === 3 ? ourClues : ["—", "—", "—"]}
              onChange={amEncryptor || sent ? undefined : (next) => actions?.setCode("decrypt", next)}
              tone={myTeam}
            />
            <p className="text-[11.5px] text-muted text-center">
              {sent
                ? "أُرسلت — لا يمكن التعديل"
                : "أي لاعب في فريقكم يستطيع تحريك الأرقام — الجميع يرى نفس الشاشة"}
            </p>
            <SectionLine>سجلّكم</SectionLine>
            <ClueGrid lanes={ourLanes} team={myTeam} />
          </>
        ) : !canIntercept ? (
          <Empty
            title="لا اعتراض في الجولة الأولى"
            body="لم يقل الخصم شيئًا بعد، فلا يوجد ما يُبنى عليه تخمين. الاعتراض يبدأ من الجولة الثانية."
          />
        ) : (
          <>
            <Cartouche
              values={draft?.intercept ?? [null, null, null]}
              clues={theirClues.length === 3 ? theirClues : ["—", "—", "—"]}
              onChange={sent ? undefined : (next) => actions?.setCode("intercept", next)}
              tone={theirTeam}
            />
            <SectionLine>سجلّ {TEAM_LABEL[theirTeam]}</SectionLine>
            <ClueGrid
              lanes={theirLanes}
              team={theirTeam}
              guesses={guesses}
              myUid={uid}
              names={names}
              onGuess={(n, t) => setGuessWord?.(uid, n, t)}
            />
          </>
        )}
        {err && <Banner tone="warn">{err}</Banner>}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
        style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
      >
        {sent ? (
          <div className="flex items-center justify-center gap-2.5 py-3">
            <Avatar
              n={room.players[sentBy!]?.avatar ?? 0}
              team={myTeam}
              size={24}
            />
            <span className="text-[13.5px] text-muted">
              أرسلها {room.players[sentBy!]?.name ?? "زميل"} — بانتظار الخصم
            </span>
          </div>
        ) : (
          <>
            <Btn className="w-full" disabled={!complete} onClick={() => actions?.submit(uid)}>
              أرسل إجابة الفريق
            </Btn>
            <p className="text-[11px] text-muted text-center mt-2 leading-relaxed">
              {complete
                ? "أي لاعب في الفريق يستطيع الإرسال — وبعدها تُقفل الأرقام"
                : canIntercept
                ? "أكملوا الشفرتين قبل الإرسال"
                : "أكملوا الأرقام الثلاثة قبل الإرسال"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  on, onClick, children, color, disabled,
}: {
  on: boolean; onClick: () => void; children: React.ReactNode; color: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg py-2.5 text-[14px] font-medium transition disabled:opacity-35"
      style={{
        background: on ? `${color}1F` : "transparent",
        color: on ? color : "#8794B8",
        boxShadow: on ? `inset 0 0 0 1px ${color}55` : undefined,
      }}
    >
      {children}
    </button>
  );
}

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[11.5px] text-muted whitespace-nowrap">{children}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

/* ================================================================== */
/* reveal                                                             */
/* ================================================================== */

export function RevealPhase({ room, myTeam, rounds }: Ctx) {
  const rec = rounds.find((r) => r.round === room.round);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const a = setTimeout(() => setStep(1), 1600);
    return () => clearTimeout(a);
  }, [room.round]);

  if (!rec) return <Empty title="جارٍ الكشف…" />;

  return (
    <div className="px-4 py-4 space-y-3">
      {TEAMS.map((t, idx) => (
        <RevealCard
          key={t}
          team={t}
          rec={rec}
          room={room}
          mine={t === myTeam}
          visible={step >= idx}
        />
      ))}
    </div>
  );
}

function RevealCard({
  team, rec, room, mine, visible,
}: {
  team: TeamId; rec: RoundRecord; room: Room; mine: boolean; visible: boolean;
}) {
  const side = rec.data[team];
  const opp = OTHER[team];
  const color = TEAM_HEX[team];

  if (!visible) {
    return <div className="card h-32 grid place-items-center text-[13px] text-muted">…</div>;
  }

  return (
    <div className="card p-4 fade-in" style={{ borderColor: `${color}44` }}>
      <div className="flex items-center justify-between mb-3 min-h-[2rem]">
        <span className="font-display text-[16px]" style={{ color }}>
          شفرة {TEAM_LABEL[team]}
          {mine && <span className="text-[11px] text-muted ms-2">فريقكم</span>}
        </span>
        <span className="flex gap-1.5">
          {side.wasBreached && <Stamp kind="breach" />}
          {side.faulted && <Stamp kind="fault" />}
        </span>
      </div>

      {side.noClues ? (
        <Banner tone="warn">
          لم تصل تلميحات هذا الفريق قبل انتهاء الوقت — خلل تلقائي.
        </Banner>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {side.clues.map((c, i) => (
              <span key={i} className="chip">
                <span className="text-[10px] text-muted">{ORDINALS[i]}</span>
                {c}
              </span>
            ))}
          </div>

          <div className="mb-3">
            <p className="text-[11px] text-muted mb-1.5">الشفرة الحقيقية</p>
            <Cartouche values={side.code} tone={team} />
          </div>

          <div className="space-y-2 pt-1">
            <GuessRow
              label={`${TEAM_LABEL[team]} فكّها`}
              guess={side.decrypt}
              truth={side.code}
            />
            {rec.round >= 2 && (
              <GuessRow
                label={`اعتراض ${TEAM_LABEL[opp]}`}
                guess={side.intercept}
                truth={side.code}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GuessRow({
  label, guess, truth,
}: { label: string; guess: (number | null)[]; truth: number[] }) {
  const hit = guess.every((g, i) => g === truth[i]);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-muted truncate">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        {guess.map((g, i) => {
          const ok = g === truth[i];
          return (
            <span
              key={i}
              className="num w-8 h-8 grid place-items-center rounded-md text-[15px] font-display border"
              style={{
                borderColor: ok ? "#4FA07A88" : "#D6564A66",
                background: ok ? "#4FA07A18" : "#D6564A12",
                color: ok ? "#6FBF95" : "#E57A6F",
              }}
            >
              {g == null ? "—" : g}
            </span>
          );
        })}
        <span className="text-[14px] ms-1" style={{ color: hit ? "#6FBF95" : "#E57A6F" }}>
          {hit ? "✓" : "✕"}
        </span>
      </span>
    </div>
  );
}

/* ================================================================== */
/* round end                                                          */
/* ================================================================== */

export function RoundEndPhase({ room, uid, myTeam, rounds, away }: Ctx) {
  const isHost = room.hostUid === uid;
  const rec = rounds.find((r) => r.round === room.round);

  const wanderers = away
    .filter((a) => a.count > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5);

  const nextEncryptors = TEAMS.map((t) => {
    const m = room.teams[t].members;
    const next = m[(room.teams[t].encryptorIdx + 1) % Math.max(m.length, 1)];
    return { team: t, uid: next };
  });

  return (
    <div className="px-4 py-5 space-y-4 pb-28 fade-in">
      <div className="card p-4">
        <p className="text-[12px] text-muted mb-3">الحصيلة</p>
        <div className="space-y-2.5">
          {TEAMS.map((t) => {
            const s = room.teams[t].score;
            return (
              <div key={t} className="flex items-center justify-between">
                <span className="font-display text-[15px]" style={{ color: TEAM_HEX[t] }}>
                  {TEAM_LABEL[t]}
                </span>
                <span className="flex items-center gap-4 text-[12.5px]">
                  <span style={{ color: "#6FBF95" }}>
                    اختراق <span className="num">{s.breach}</span>/<span className="num">{2}</span>
                  </span>
                  <span style={{ color: "#E57A6F" }}>
                    خلل <span className="num">{s.fault}</span>/<span className="num">{2}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px] text-muted mt-3.5 leading-relaxed border-t border-line pt-3">
          اختراقان يفوزان باللعبة. خللان يخسرانها.
        </p>
      </div>

      {wanderers.length > 0 && (
        <div className="card p-4" style={{ borderColor: "#7A4A2A" }}>
          <p className="text-[12px] mb-3" style={{ color: "#E0A46C" }}>
            من غادر الشاشة هذه الجولة
          </p>
          <div className="space-y-2">
            {wanderers.map((a) => (
              <div key={a.uid} className="flex items-center justify-between gap-2">
                <Avatar
                  n={room.players[a.uid]?.avatar ?? 0}
                  name={room.players[a.uid]?.name ?? "؟"}
                  team={room.players[a.uid]?.team ?? null}
                  size={24}
                />
                <span className="num text-[12px] text-muted shrink-0">
                  {a.count}× · {Math.round(a.ms / 1000)}ث
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            إشعار على الهاتف يُحتسب أيضًا. لقطات الشاشة لا يمكن رصدها من المتصفح.
          </p>
        </div>
      )}

      <div className="card p-4">
        <p className="text-[12px] text-muted mb-3">المُشفِّر في الجولة القادمة</p>
        <div className="space-y-2">
          {nextEncryptors.map(({ team, uid: u }) => (
            <div key={team} className="flex items-center justify-between">
              <Avatar
                n={room.players[u]?.avatar ?? 0}
                name={room.players[u]?.name ?? "؟"}
                team={team}
                size={26}
              />
              <span className="text-[12px]" style={{ color: TEAM_HEX[team] }}>
                {TEAM_LABEL[team]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isHost && (
        <div
          className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
          style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
        >
          <Btn
            className="w-full"
            onClick={() =>
              api.advancePhase({ roomId: room.id, force: true, fromPhase: "roundEnd", fromRound: room.round })
                .catch(() => {})
            }
          >
            {room.winner ? "النتيجة النهائية" : "الجولة التالية"}
          </Btn>
        </div>
      )}
    </div>
  );
}
