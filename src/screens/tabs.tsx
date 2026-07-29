import { useState } from "react";
import { api, errText } from "../lib/firebase";
import { ORDINALS } from "../lib/arabic";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Banner, Btn, Empty, TEAM_HEX, TEAM_LABEL } from "../components/ui";

/* ================================================================== */
/* log                                                                */
/* ================================================================== */

export function LogTab({
  room, myTeam, keys, rounds, theories, setTheory,
}: {
  room: Room;
  myTeam: TeamId;
  keys: string[] | null;
  rounds: RoundRecord[];
  theories: Record<string, string>;
  setTheory: ((n: string, text: string) => void) | null;
}) {
  const theirTeam = OTHER[myTeam];
  const [side, setSide] = useState<TeamId>(theirTeam);
  const [chrono, setChrono] = useState(false);

  const lanes = buildLanes(rounds, side, side === myTeam ? keys : null);
  const editingTheirs = side === theirTeam;

  return (
    <div className="px-4 py-3 pb-8">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0C1330] border border-line mb-3">
        {[theirTeam, myTeam].map((t) => (
          <button
            key={t}
            onClick={() => setSide(t)}
            className="rounded-lg py-2.5 text-[14px] font-medium transition"
            style={{
              background: side === t ? `${TEAM_HEX[t]}1F` : "transparent",
              color: side === t ? TEAM_HEX[t] : "#8794B8",
              boxShadow: side === t ? `inset 0 0 0 1px ${TEAM_HEX[t]}55` : undefined,
            }}
          >
            {t === myTeam ? "تلميحاتنا" : `تلميحات ${TEAM_LABEL[t]}`}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11.5px] text-muted">
          {side === myTeam
            ? "ما قلتموه عن كل مفتاح"
            : "تخميناتكم لكل رقم · مشتركة بين الفريق"}
        </p>
        <button className="text-[11.5px] text-gold" onClick={() => setChrono((c) => !c)}>
          {chrono ? "حسب الرقم" : "حسب الجولة"}
        </button>
      </div>

      {chrono ? (
        rounds.length === 0 ? (
          <Empty title="السجل فارغ" body="يمتلئ بعد أول كشف." />
        ) : (
          <Chrono rounds={rounds} team={side} />
        )
      ) : (
        <ClueGrid
          lanes={lanes}
          team={side}
          theories={editingTheirs ? theories : undefined}
          onGuess={editingTheirs ? (n, t) => setTheory?.(n, t) : undefined}
        />
      )}
    </div>
  );
}

function Chrono({
  rounds, team,
}: { rounds: RoundRecord[]; team: TeamId }) {
  return (
    <div className="space-y-2">
      {[...rounds].reverse().map((r) => {
        const side = r.data?.[team];
        if (!side) return null;
        return (
          <div key={r.round} className="card p-3">
            <p className="text-[11px] text-muted mb-2">
              الجولة {r.round}
            </p>
            {side.noClues ? (
              <p className="text-[12.5px] text-alarm">لا تلميحات</p>
            ) : (
              <div className="space-y-1.5">
                {side.clues.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span
                      className="num text-[14px] font-semibold w-6 h-6 grid place-items-center rounded-md"
                      style={{
                        color: TEAM_HEX[team],
                        background: `${TEAM_HEX[team]}18`,
                        border: `1px solid ${TEAM_HEX[team]}40`,
                      }}
                    >
                      {side.code[i]}
                    </span>
                    <span className="text-[21px] font-medium">{c}</span>
                    <span className="text-[10px] text-muted">{ORDINALS[i]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* team                                                               */
/* ================================================================== */

export function TeamTab({
  room, uid, myTeam, onLeave,
}: { room: Room; uid: string; myTeam: TeamId; onLeave: () => void }) {
  const isHost = room.hostUid === uid;

  return (
    <div className="px-4 py-3 pb-10 space-y-4">
      {TEAMS.map((t) => (
        <div key={t} className="card p-4" style={{ borderColor: `${TEAM_HEX[t]}3A` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-[16px]" style={{ color: TEAM_HEX[t] }}>
              {TEAM_LABEL[t]}
              {t === myTeam && <span className="text-[11px] text-muted ms-2">فريقك</span>}
            </span>
            <span className="text-[12px] text-muted">
              اختراق <span className="num">{room.teams[t].score.breach}</span>
              {" · "}
              خلل <span className="num">{room.teams[t].score.fault}</span>
            </span>
          </div>
          <div className="space-y-2">
            {room.teams[t].members.map((m) => (
              <div key={m} className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px]">
                  {room.players[m]?.name ?? "—"}
                </span>
                <span className="flex gap-2 text-[10.5px] text-muted shrink-0">
                  {room.encryptor[t] === m && (
                    <span style={{ color: TEAM_HEX[t] }}>مُشفِّر هذه الجولة</span>
                  )}
                  {room.hostUid === m && <span>مضيف</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <p className="text-[12px] text-muted mb-2.5">كيف تُحسب النتيجة</p>
        <ul className="space-y-2 text-[13px] leading-relaxed">
          <li>
            <span style={{ color: "#8FAE5C" }}>اختراق</span> — التقطتم شفرة الخصم. اختراقان يفوزان.
          </li>
          <li>
            <span style={{ color: "#F03B2E" }}>خلل</span> — فريقكم أخطأ في فهم مُشفِّركم. خللان يخسران.
          </li>
          <li className="text-muted">
            أن يفهمكم فريقكم لا يمنحكم شيئًا — يمنعكم فقط من الخسارة.
          </li>
        </ul>
      </div>

      {isHost && room.phase !== "over" && (
        <div className="card p-4 space-y-2">
          <p className="text-[12px] text-muted mb-1">تحكّم المضيف</p>
          <div className="grid grid-cols-3 gap-2">
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: room.paused ? "resume" : "pause" })}
            >
              {room.paused ? "استئناف" : "إيقاف"}
            </Btn>
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: "addTime" })}
            >
              +{30}ث
            </Btn>
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() =>
                api.advancePhase({
                  roomId: room.id, force: true, fromPhase: room.phase, fromRound: room.round,
                }).catch(() => {})
              }
            >
              تخطٍّ / متابعة
            </Btn>
          </div>
          <button
            className="w-full text-[12px] text-alarm/80 pt-2"
            onClick={() =>
              api.hostControl({ roomId: room.id, action: "endGame" }).catch((e) => {
                alert(errText(e));
              })
            }
          >
            إنهاء اللعبة والعودة للردهة
          </button>
        </div>
      )}

      <button
        className="w-full text-[12px] text-muted/70 py-3"
        onClick={() => api.leaveRoom({ roomId: room.id }).finally(onLeave)}
      >
        مغادرة الغرفة
      </button>
    </div>
  );
}

/* ================================================================== */
/* game over                                                          */
/* ================================================================== */

const REASON: Record<string, string> = {
  breach: "باختراقين",
  opponentFault: "بخللين على الخصم",
  points: "بفارق النقاط",
  exhausted: "نفدت الجولات",
  abandoned: "أُنهيت اللعبة",
};

const BREACH = "#8FAE5C";
const FAULT = "#F03B2E";

function FinalScoreboard({
  room, myTeam, winnerTeam,
}: {
  room: Room;
  myTeam: TeamId | null;
  winnerTeam: TeamId | null;
}) {
  return (
    <div className="card p-3 mb-2 fade-in" style={{ borderColor: "#3A3629" }}>
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const s = room.teams[t].score;
          const color = TEAM_HEX[t];
          const champ = winnerTeam === t;
          const mine = myTeam === t;
          return (
            <div
              key={t}
              className="rounded-lg border px-2.5 py-2.5 flex flex-col items-center gap-2"
              style={{
                borderColor: champ ? `${color}99` : `${color}44`,
                background: champ ? `${color}18` : `${color}0A`,
                boxShadow: champ ? `inset 0 0 0 1px ${color}55` : undefined,
              }}
            >
              <p
                className="font-display text-[15px] leading-none"
                style={{ color }}
              >
                {TEAM_LABEL[t]}
                {mine && (
                  <span className="text-[9px] text-muted ms-1.5 font-sans">أنت</span>
                )}
                {champ && (
                  <span className="text-[9px] font-bold ms-1.5 font-sans" style={{ color }}>
                    · فائز
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 w-full justify-center">
                <ScoreMeter label="اختراق" n={s.breach} max={2} color={BREACH} />
                <span className="w-px h-8 bg-line" />
                <ScoreMeter label="خلل" n={s.fault} max={2} color={FAULT} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreMeter({
  label, n, max, color,
}: {
  label: string;
  n: number;
  max: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-baseline gap-1" style={{ color }}>
        <span className="text-[10px]">{label}</span>
        <span className="num font-display text-[20px] leading-none">{n}</span>
        <span className="num text-[11px] text-muted">/{max}</span>
      </div>
      <span className="inline-flex gap-1" style={{ color }} aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <i
            key={i}
            className={`pip ${i < n ? "pip-on" : ""}`}
            style={{ width: 10, height: 10 }}
          />
        ))}
      </span>
    </div>
  );
}

/** Encryptors on the losing side who got intercepted or faulted while writing. */
function EncryptorShame({
  room, rounds, loserTeam,
}: {
  room: Room;
  rounds: RoundRecord[];
  loserTeam: TeamId;
}) {
  type Row = { uid: string; breaches: number[]; faults: number[]; silents: number[] };
  const byUid = new Map<string, Row>();

  for (const r of rounds) {
    const side = r.data?.[loserTeam];
    if (!side?.encryptorUid) continue;
    let row = byUid.get(side.encryptorUid);
    if (!row) {
      row = { uid: side.encryptorUid, breaches: [], faults: [], silents: [] };
      byUid.set(side.encryptorUid, row);
    }
    if (side.wasBreached) row.breaches.push(r.round);
    if (side.faulted) {
      row.faults.push(r.round);
      if (side.noClues) row.silents.push(r.round);
    }
  }

  const rows = [...byUid.values()]
    .filter((r) => r.breaches.length > 0 || r.faults.length > 0)
    .sort(
      (a, b) =>
        b.breaches.length + b.faults.length - (a.breaches.length + a.faults.length)
    );

  if (rows.length === 0) return null;

  const color = TEAM_HEX[loserTeam];

  return (
    <div
      className="card p-4 mt-4 fade-in"
      style={{ borderColor: "#F03B2E55", background: "#F03B2E0A" }}
    >
      <p className="text-[13px] font-bold mb-1" style={{ color: FAULT }}>
        المُشفِّرون تحت المساءلة
      </p>
      <p className="text-[11px] text-muted mb-3 leading-relaxed">
        من {TEAM_LABEL[loserTeam]} — شفرات اختُرقت أو انتهت بخلل وهم يكتبون التلميحات
      </p>
      <div className="space-y-3">
        {rows.map((r) => {
          const name = room.players[r.uid]?.name ?? "؟";
          return (
            <div
              key={r.uid}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: `${color}44`, background: "#0C1330" }}
            >
              <p className="font-medium text-[16px] mb-1.5" style={{ color }}>
                {name}
              </p>
              <div className="space-y-1 text-[12.5px] leading-snug">
                {r.breaches.length > 0 && (
                  <p style={{ color: FAULT }}>
                    اخترقوا شفرته{" "}
                    <span className="text-muted">
                      ({r.breaches.map((n) => `جولة ${n}`).join("، ")})
                    </span>
                  </p>
                )}
                {r.faults.length > 0 && (
                  <p style={{ color: FAULT }}>
                    خلل وهو المُشفِّر{" "}
                    <span className="text-muted">
                      ({r.faults.map((n) => `جولة ${n}`).join("، ")}
                      {r.silents.length > 0
                        ? ` · صمت في ${r.silents.map((n) => `جولة ${n}`).join("، ")}`
                        : ""}
                      )
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GameOver({
  room, uid, myTeam, keys, rounds, onLeave, finalKeys,
}: {
  room: Room; uid: string; myTeam: TeamId | null;
  keys: string[] | null; rounds: RoundRecord[]; onLeave: () => void;
  /** All eight keywords, unsealed only now that the game is over. */
  finalKeys?: Record<TeamId, string[]> | null;
}) {
  const isHost = room.hostUid === uid;
  const won = room.winner === myTeam;
  const draw = room.winner === "draw";
  const winnerTeam = !draw && (room.winner === "gold" || room.winner === "silver")
    ? (room.winner as TeamId)
    : null;
  const loserTeam = winnerTeam ? OTHER[winnerTeam] : null;
  const winnerNames = winnerTeam
    ? Object.entries(room.players)
        .filter(([, p]) => p.team === winnerTeam)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
        .map(([, p]) => p.name)
    : [];

  return (
    <div className="px-4 py-8 pb-28" style={{ paddingTop: "calc(var(--safe-t) + 32px)" }}>
      <div className="text-center mb-8 fade-in">
        <p className="text-[12px] text-muted mb-2">{REASON[room.endReason ?? ""] ?? ""}</p>
        <h1
          className="font-display text-[40px] leading-tight"
          style={{ color: draw ? "#EFE7D4" : TEAM_HEX[room.winner as TeamId] ?? "#EFE7D4" }}
        >
          {draw ? "تعادل" : `فاز ${TEAM_LABEL[room.winner as TeamId]}`}
        </h1>
        {winnerNames.length > 0 && (
          <p
            className="text-[18px] font-medium mt-3 leading-relaxed"
            style={{ color: TEAM_HEX[winnerTeam!] }}
          >
            {winnerNames.join(" · ")}
          </p>
        )}
        {myTeam && !draw && (
          <p className="text-[22px] mt-2">{won ? "🏆" : "💔"}</p>
        )}
      </div>

      <FinalScoreboard room={room} myTeam={myTeam} winnerTeam={winnerTeam} />

      {loserTeam && (
        <EncryptorShame room={room} rounds={rounds} loserTeam={loserTeam} />
      )}
      {draw &&
        TEAMS.map((t) => (
          <EncryptorShame key={t} room={room} rounds={rounds} loserTeam={t} />
        ))}

      <p className="text-[12px] text-muted mb-3 px-1 mt-8">كل المفاتيح، وكل ما قيل عنها</p>
      <div className="space-y-3">
        {TEAMS.map((t) => (
          <div key={t} className="card p-3.5" style={{ borderColor: `${TEAM_HEX[t]}44` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-[15px]" style={{ color: TEAM_HEX[t] }}>
                {TEAM_LABEL[t]}
              </span>
              <span className="text-[11.5px] text-muted">
                اختراق <span className="num">{room.teams[t].score.breach}</span>
                {" · "}خلل <span className="num">{room.teams[t].score.fault}</span>
              </span>
            </div>
            <ClueGrid
              lanes={buildLanes(rounds, t, finalKeys?.[t] ?? (t === myTeam ? keys : null))}
              team={t}
            />
          </div>
        ))}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
        style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
      >
        {isHost ? (
          <Btn
            className="w-full"
            onClick={() =>
              api.rematch({ roomId: room.id }).catch((e) => {
                alert(errText(e));
              })
            }
          >
            إنهاء اللعبة والعودة للردهة
          </Btn>
        ) : (
          <p className="text-center text-[13px] text-muted py-3">
            بانتظار المضيف…
          </p>
        )}
        <button
          className="w-full text-[12px] text-muted/70 pt-3"
          onClick={() => api.leaveRoom({ roomId: room.id }).finally(onLeave)}
        >
          مغادرة الغرفة
        </button>
      </div>
    </div>
  );
}

