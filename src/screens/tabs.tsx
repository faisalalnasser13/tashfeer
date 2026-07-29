import { useState } from "react";
import { api, errText } from "../lib/firebase";
import { ORDINALS } from "../lib/arabic";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Banner, Btn, Empty, PipBoard, TEAM_HEX, TEAM_LABEL } from "../components/ui";

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
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[theirTeam, myTeam].map((t) => {
          const on = side === t;
          const color = TEAM_HEX[t];
          return (
            <button
              key={t}
              onClick={() => setSide(t)}
              className="py-2.5 px-2 text-[14px] font-medium transition border"
              style={{
                borderRadius: 0,
                borderColor: on ? `${color}88` : "#3A3629",
                background: on ? `${color}1F` : "#1B1A14",
                color: on ? color : "#8794B8",
              }}
            >
              {t === myTeam ? "سجلنا" : "سجل العدو"}
            </button>
          );
        })}
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
                <span className="flex items-center gap-2 text-[10.5px] text-muted shrink-0">
                  {room.encryptor[t] === m && (
                    <span style={{ color: TEAM_HEX[t] }}>مُشفِّر هذه الجولة</span>
                  )}
                  {room.hostUid === m && <span>مضيف</span>}
                  {isHost && m !== uid && room.phase !== "over" && (
                    <button
                      type="button"
                      className="text-[11px] text-alarm/80"
                      onClick={() =>
                        api.kickPlayer({ roomId: room.id, uid: m }).catch((e) => {
                          alert(errText(e));
                        })
                      }
                    >
                      إخراج
                    </button>
                  )}
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
    <div className="card p-2.5 mb-2 fade-in" style={{ borderColor: "#3A3629" }}>
      <div className="grid grid-cols-2 gap-1.5">
        {TEAMS.map((t) => {
          const s = room.teams[t].score;
          const color = TEAM_HEX[t];
          const champ = winnerTeam === t;
          const mine = myTeam === t;
          return (
            <div
              key={t}
              className="rounded-lg border px-2 py-2 flex flex-col items-center gap-1.5"
              style={{
                borderColor: champ ? `${color}99` : `${color}44`,
                background: champ ? `${color}18` : `${color}0A`,
              }}
            >
              <p
                className="font-display text-[13px] leading-none"
                style={{ color }}
              >
                {TEAM_LABEL[t]}
                {mine && (
                  <span className="text-[8px] text-muted ms-1 font-sans">أنت</span>
                )}
                {champ && (
                  <span className="text-[8px] font-bold ms-1 font-sans" style={{ color }}>
                    · فائز
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2.5 w-full justify-center">
                <ScoreMeter label="اختراق" n={s.breach} max={2} color={BREACH} />
                <span className="w-px h-6 bg-line" />
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
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-baseline gap-1" style={{ color }}>
        <span className="text-[9px]">{label}</span>
        <span className="num font-display text-[16px] leading-none">{n}</span>
        <span className="num text-[10px] text-muted">/{max}</span>
      </div>
      <PipBoard n={n} max={max} color={color} size="sm" title={label} />
    </div>
  );
}

/** One bad encryptor turn — breach and/or fault — with that round's clues inline. */
type ShameRow = {
  uid: string;
  round: number;
  breached: boolean;
  faulted: boolean;
  silent: boolean;
  clues: string[];
};

/** Encryptors on the losing side who got intercepted or faulted while writing. */
function EncryptorShame({
  room, rounds, loserTeam,
}: {
  room: Room;
  rounds: RoundRecord[];
  loserTeam: TeamId;
}) {
  const rows: ShameRow[] = [];

  for (const r of rounds) {
    const side = r.data?.[loserTeam];
    if (!side?.encryptorUid) continue;
    if (!side.wasBreached && !side.faulted) continue;
    rows.push({
      uid: side.encryptorUid,
      round: r.round,
      breached: side.wasBreached,
      faulted: side.faulted,
      silent: side.noClues,
      clues: side.noClues ? [] : side.clues,
    });
  }

  rows.sort((a, b) => a.round - b.round);
  if (rows.length === 0) return null;

  const color = TEAM_HEX[loserTeam];

  return (
    <div
      className="card p-3 mt-3 fade-in"
      style={{ borderColor: "#F03B2E55", background: "#F03B2E0A" }}
    >
      <p className="text-[12px] font-bold mb-2" style={{ color: FAULT }}>
        لائحة النكبات · {TEAM_LABEL[loserTeam]}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const name = room.players[r.uid]?.name ?? "؟";
          return (
            <div
              key={`${r.uid}-${r.round}`}
              className="rounded-md border px-2 py-1.5 flex items-center gap-2 min-w-0"
              style={{ borderColor: `${color}44`, background: "#0C1330" }}
            >
              <span
                className="font-medium text-[12px] shrink-0 truncate max-w-[4.5rem]"
                style={{ color }}
              >
                {name}
              </span>
              <span className="flex items-center gap-1 shrink-0 text-[9px] font-bold">
                {r.breached && <span style={{ color: FAULT }}>اختراق</span>}
                {r.faulted && (
                  <span style={{ color: FAULT }}>
                    {r.silent ? "صمت" : "خلل"}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 min-w-0 flex-1 justify-end overflow-hidden">
                {r.silent || r.clues.length === 0 ? (
                  <span className="text-[9px] text-muted">—</span>
                ) : (
                  r.clues.map((c, i) => (
                    <span
                      key={i}
                      className="text-[9px] leading-tight px-1.5 py-0.5 truncate max-w-[4.25rem] border"
                      style={{
                        borderColor: `${color}55`,
                        background: `${color}14`,
                        color: "#EFE7D4",
                        borderRadius: 3,
                      }}
                      title={c}
                    >
                      {c}
                    </span>
                  ))
                )}
              </span>
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
    <div className="px-4 py-5 pb-28" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      <div className="text-center mb-4 fade-in">
        <p className="text-[11px] text-muted mb-1">{REASON[room.endReason ?? ""] ?? ""}</p>
        <h1
          className="font-display text-[28px] leading-tight"
          style={{ color: draw ? "#EFE7D4" : TEAM_HEX[room.winner as TeamId] ?? "#EFE7D4" }}
        >
          {draw ? "تعادل" : (
            <>
              فاز {TEAM_LABEL[room.winner as TeamId]}
              {myTeam && (
                <span className="text-[18px] ms-1.5 align-middle">
                  {won ? "🏆" : "💔"}
                </span>
              )}
            </>
          )}
        </h1>
        {winnerNames.length > 0 && (
          <p
            className="text-[13px] font-medium mt-1.5 leading-snug"
            style={{ color: TEAM_HEX[winnerTeam!] }}
          >
            {winnerNames.join(" · ")}
          </p>
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

      <p className="text-[11px] text-muted mb-2 px-1 mt-5">كل المفاتيح، وكل ما قيل عنها</p>
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
              declassified
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

