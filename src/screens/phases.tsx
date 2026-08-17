import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api, errText } from "../lib/firebase";
import { syncedNow } from "../lib/engine";
import { normalizeText, normalizeKeyword, ordinalsFor } from "../lib/arabic";
import { useDraft, useLocal } from "../lib/hooks";
import type { AwayRecord, Draft, Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { Cartouche } from "../components/Cartouche";
import { buildLanes, ClueGrid, SharedGuessInput } from "../components/ClueGrid";
import { TeamEmblem } from "../components/TeamEmblem";
import { Banner, Btn, Empty, PipBoard, Stamp, TEAM_HEX } from "../components/ui";
import { codesEqual, points, tiebreakTrigger, type TiebreakTrigger } from "../lib/rules";
import { S } from "../lib/strings";

interface Ctx {
  room: Room;
  uid: string;
  myTeam: TeamId;
  keys: string[] | null;
  usedClues: string[];
  theories: Record<string, string>;
  rounds: RoundRecord[];
  draft: Draft | null;
  actions: {
    setCode: (f: "decrypt" | "intercept", values: (number | null)[]) => Promise<unknown>;
    submit: (uid: string, field: "decrypt" | "intercept") => Promise<unknown>;
  } | null;
  code: number[] | null;
  /** Clues this encryptor already wrote to the secret doc (survives remount). */
  mySubmittedClues: string[] | null;
  away: AwayRecord[];
  setTheory: ((n: string, text: string) => void) | null;
  guessWords: Record<string, string>;
  setGuessWord: ((n: string, text: string) => void) | null;
  guessSubmittedAt: number | null;
}

/** Host skip for short transition beats (keys / reveal / roundEnd). */
function HostContinue({
  room, uid, label,
}: {
  room: Room; uid: string; label: string;
}) {
  if (room.hostUid !== uid) return null;
  return (
    <div
      className="fixed inset-x-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3 z-40"
      style={{
        // Sit above the tab bar (same offset as the guess dock).
        bottom: "calc(3.25rem + var(--safe-b))",
        paddingBottom: "10px",
      }}
    >
      <Btn
        className="w-full"
        onClick={() =>
          api.advancePhase({
            roomId: room.id, force: true, fromPhase: room.phase, fromRound: room.round,
          }).catch((e) => { alert(errText(e, room.lang)); })
        }
      >
        {label}
      </Btn>
    </div>
  );
}

/* ================================================================== */
/* keys                                                               */
/* ================================================================== */

export function KeysPhase({ room, uid, myTeam, keys }: Ctx) {
  const isHost = room.hostUid === uid;
  const color = TEAM_HEX[myTeam];
  const other = OTHER[myTeam];
  const [busy, setBusy] = useState<TeamId | null>(null);
  const [err, setErr] = useState("");
  const s = S(room.lang);

  async function reshuffle(team: TeamId) {
    setErr("");
    setBusy(team);
    try {
      await api.shuffleTeamKeys({ roomId: room.id, team });
    } catch (e) {
      setErr(errText(e, room.lang));
    } finally {
      setBusy(null);
    }
  }

  const rows = keys ?? ["", "", "", ""];
  const stampDelayMs = (rows.length - 1) * 90 + 150;
  const crew = Object.entries(room.players)
    .filter(([, p]) => p.team === myTeam)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  return (
    <div className={`px-5 pt-2 fade-in ${isHost ? "pb-36" : "pb-28"}`}>
      <h2 className={`text-[22px] font-semibold text-center ${isHost ? "mb-4" : "mb-1"}`}>
        {s.yourFourKeys}
      </h2>
      {!isHost && (
        <p className="text-[15px] text-muted text-center mb-3 leading-relaxed -mt-0.5">
          {s.wontChange}
        </p>
      )}
      {err && (
        <div className="mb-4 max-w-sm mx-auto">
          <Banner tone="warn">{err}</Banner>
        </div>
      )}

      <div className="keys-sheet max-w-sm mx-auto">
        <div className="keys-sheet-band keys-sheet-band-top">
          <span className="keys-sheet-form num">{s.formKy1}</span>
          <span className="keys-sheet-class">{s.classified}</span>
        </div>

        {crew.length > 0 && (
          <div className={`keys-sheet-crew ${crew.length > 6 ? "keys-sheet-crew-dense" : ""}`}>
            <p className="keys-sheet-crew-label">{s.crewSigns}</p>
            <div className="keys-sheet-crew-row">
              {crew.map(([id, p]) => (
                <div key={id} className="keys-sheet-sign">
                  <span
                    className="keys-sheet-sign-name"
                    style={{ color: id === uid ? color : "#8A8474" }}
                    title={p.name}
                  >
                    {p.name}
                  </span>
                  <span className="keys-sheet-sign-rule" aria-hidden />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="keys-sheet-rows">
          {rows.map((k, i) => (
            <div
              key={i}
              className="keys-sheet-row fade-in"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="keys-sheet-num num" style={{ color }}>
                {i + 1}
              </span>
              <span className="keys-sheet-word">{k || "…"}</span>
              <span className="keys-sheet-leader" aria-hidden />
            </div>
          ))}
        </div>

        <div className="keys-sheet-band keys-sheet-band-foot">
          <span className="keys-sheet-destroy">{s.destroyAfter}</span>
          <span
            className="stamp stamp-bad keys-sheet-stamp"
            style={{ animationDelay: `${stampDelayMs}ms` }}
          >
            {s.secretStamp}
          </span>
        </div>
      </div>

      {isHost && (
        <div className="keys-cmds">
          <p className="keys-cmds-label">{s.hostOrders}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => reshuffle(myTeam)}
            className="keys-cmd"
          >
            <span className="keys-cmd-label">{s.changeKeys(s.team[myTeam])}</span>
            <span className="keys-cmd-action">{busy === myTeam ? "…" : s.change}</span>
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => reshuffle(other)}
            className="keys-cmd"
            style={{ borderColor: `${TEAM_HEX[other]}66` }}
          >
            <span className="keys-cmd-label" style={{ color: TEAM_HEX[other] }}>
              {s.changeKeys(s.team[other])}
              <span className="keys-cmd-hint">{s.withoutShowing}</span>
            </span>
            <span className="keys-cmd-action">{busy === other ? "…" : s.change}</span>
          </button>
        </div>
      )}

      {isHost && <HostContinue room={room} uid={uid} label={s.startEncrypt} />}
    </div>
  );
}

/* ================================================================== */
/* encrypt                                                            */
/* ================================================================== */

export function EncryptPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, usedClues, code } = ctx;
  const amEncryptor = room.encryptor[myTeam] === uid;
  return amEncryptor
    ? <EncryptorView key={`${room.id}:${room.round}`} {...ctx} />
    : <EncryptWaiting {...ctx} />;
}

function EncryptorView({ room, myTeam, keys, usedClues, code, rounds, mySubmittedClues }: Ctx) {
  // Survives tab unmount (Game remounts the play tab). Cleared per round via key.
  const alreadyIn = room.cluesIn[myTeam] === true;
  const s = S(room.lang);
  const ORDINALS = ordinalsFor(room.lang);
  const [clues, setClues] = useLocal<string[]>(
    `tashfeer.encryptClues.${room.id}.${room.round}`,
    ["", "", ""],
  );
  const [sentLocal, setSentLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  /** Digit 1–4 whose full past-clue list is open in the overlay. */
  const [pastOpen, setPastOpen] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  const sent = alreadyIn || sentLocal || Boolean(mySubmittedClues);

  useEffect(() => {
    if (mySubmittedClues && mySubmittedClues.length === 3) {
      setClues(mySubmittedClues);
      setSentLocal(true);
    }
  }, [mySubmittedClues]);

  const usedSet = useMemo(() => new Set(usedClues.map((c) => normalizeText(c, room.lang))), [usedClues, room.lang]);
  const keySet = useMemo(() => new Set((keys ?? []).map((k) => normalizeKeyword(k, room.lang))), [keys, room.lang]);

  function problem(i: number): string | null {
    const raw = clues[i].trim();
    if (!raw) return null;
    if (keySet.has(normalizeKeyword(raw, room.lang))) return s.isYourKeyword;
    if (usedSet.has(normalizeText(raw, room.lang))) return s.usedBefore;
    const dup = clues.findIndex((c, j) => j !== i && c.trim() && normalizeText(c, room.lang) === normalizeText(raw, room.lang));
    if (dup >= 0 && dup < i) return s.duplicate;
    return null;
  }

  const filled = clues.every((c) => c.trim().length > 0);
  const clean = filled && [0, 1, 2].every((i) => !problem(i));
  const blockReason = !filled
    ? s.finishThree
    : ([0, 1, 2].map(problem).find(Boolean) ?? null);

  async function send() {
    setBusy(true); setErr("");
    try {
      await api.submitClues({ roomId: room.id, clues: clues.map((c) => c.trim()) });
      setSentLocal(true);
      try {
        localStorage.removeItem(`tashfeer.encryptClues.${room.id}.${room.round}`);
      } catch { /* private mode */ }
    } catch (e) { setErr(errText(e, room.lang)); } finally { setBusy(false); }
  }

  /**
   * iOS Safari scrolls a focused input toward the top of the visual
   * viewport (especially the last field). Undo that so the consolidated
   * encrypt layout stays put. Android must keep default scroll-into-view
   * — cancelling it buries lower fields under the keyboard.
   */
  function holdScrollOnFocus() {
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    const scroller = document.querySelector(".scroll-y") as HTMLElement | null;
    const yWin = window.scrollY;
    const yMain = scroller?.scrollTop ?? 0;
    const restore = () => {
      if (window.scrollY !== yWin) window.scrollTo(0, yWin);
      if (scroller && scroller.scrollTop !== yMain) scroller.scrollTop = yMain;
    };
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 50);
    window.setTimeout(restore, 150);
    window.setTimeout(restore, 350);
  }

  if (sent) {
    const shown =
      clues.some((c) => c.trim())
        ? clues
        : (mySubmittedClues ?? ["…", "…", "…"]);
    return (
      <div className="px-5 py-4 fade-in">
        <Empty title={s.cluesSent} body={s.waitOtherEncryptor} />
        <div className="max-w-sm mx-auto mt-1.5 space-y-1.5">
          {shown.map((c, i) => (
            <div key={i} className="card px-3 py-2 flex items-center gap-2.5">
              <span className="text-[10px] text-muted w-9 shrink-0">{ORDINALS[i]}</span>
              <span className="text-[15px] font-medium leading-snug">{c}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lanes = buildLanes(rounds, myTeam, keys);
  const color = TEAM_HEX[myTeam];
  const warmSilver = myTeam === "silver";
  const inputBg = warmSilver ? "#2A1810" : "#1B1A14";
  const inputBorder = warmSilver ? "#6B4020" : "#3A3629";
  const inputPh = warmSilver ? "placeholder:text-[#6B5040]" : "placeholder:text-[#6E6858]";
  const pastLane = pastOpen != null ? lanes[pastOpen - 1] : null;

  return (
    <div className="px-3 pt-2 pb-4 fade-in">
      {!code && (
        <p className="text-[11px] text-muted text-center mb-2">{s.drawingCode}</p>
      )}

      <div className="card encrypt-card overflow-hidden">
        {[0, 1, 2].map((i) => {
          const target = code?.[i];
          const word = target && keys ? keys[target - 1] : null;
          const issue = problem(i);
          const past = target ? lanes[target - 1].clues : [];
          const visible = past.slice(0, 2);
          const extra = past.length - visible.length;
          const on = focusIdx === i;
          const rowOk = clues[i].trim().length > 0 && !issue;
          return (
            <div key={i} data-clue-block className="encrypt-row">
              <div
                className="encrypt-target"
                style={{
                  borderColor: on ? `${color}99` : `${color}44`,
                  background: on ? `${color}18` : `${color}0A`,
                  color: word ? color : "#6E6858",
                }}
              >
                <span className="num encrypt-target-digit">{target ?? "—"}</span>
                <span className="encrypt-target-word" title={word ?? undefined}>
                  {word ?? "…"}
                </span>
              </div>

              <div className="encrypt-mid">
                <div className="encrypt-meta">
                  <span className="encrypt-ord text-muted">{ORDINALS[i]}</span>
                  {visible.map((c, k) => (
                    <span key={k} className="chip encrypt-past-chip" title={c.text}>
                      <span className="num text-[9px] text-muted">{c.round}</span>
                      {c.text}
                    </span>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      className="chip encrypt-past-more"
                      onClick={() => target && setPastOpen(target)}
                      aria-label={s.morePastAria(extra)}
                    >
                      +{extra}
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  value={clues[i]}
                  maxLength={40}
                  enterKeyHint={i < 2 ? "next" : "done"}
                  autoComplete="off"
                  autoCorrect="off"
                  data-clue-input={i}
                  onChange={(e) => setClues((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (i < 2) {
                      inputRefs.current[i + 1]?.focus();
                      return;
                    }
                    (e.target as HTMLInputElement).blur();
                    if (clean) void send();
                  }}
                  onFocus={() => {
                    holdScrollOnFocus();
                    setFocusIdx(i);
                  }}
                  onBlur={(e) => {
                    const next = e.relatedTarget as HTMLElement | null;
                    if (next?.closest?.("[data-clue-input]") != null) return;
                    window.setTimeout(() => {
                      setFocusIdx((cur) => (cur === i ? null : cur));
                    }, 80);
                  }}
                  placeholder={s.cluePh}
                  className={`encrypt-input ${inputPh}`}
                  style={{
                    background: inputBg,
                    borderColor: issue ? "#D6564A" : on ? `${color}88` : inputBorder,
                    fontSize: "16px",
                  }}
                />
              </div>

              <div className="encrypt-check" aria-hidden>
                {rowOk ? <span style={{ color: "#8FAE5C" }}>✓</span> : null}
              </div>
            </div>
          );
        })}

        <div className="encrypt-foot">
          {err && <Banner tone="warn">{err}</Banner>}
          <Btn className="w-full !py-2.5" disabled={!clean || busy} onClick={send}>
            {busy ? s.sending : s.sendClues}
          </Btn>
          {!clean ? (
            <p
              className={`text-[10.5px] text-center leading-snug mt-1.5 ${
                filled ? "text-alarm" : "text-muted"
              }`}
            >
              {blockReason}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted text-center leading-snug mt-1.5">
              {s.noSpelling}
            </p>
          )}
        </div>
      </div>

      {pastOpen != null && pastLane && (
        <div
          className="encrypt-past-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={s.pastClues}
          onClick={() => setPastOpen(null)}
        >
          <div
            className="card encrypt-past-panel"
            style={{ borderColor: `${color}55` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-medium" style={{ color }}>
                <span className="num me-1.5">{pastOpen}</span>
                {keys?.[pastOpen - 1] ?? "…"}
                <span className="text-muted font-normal text-[11px] ms-1.5">· {s.previous}</span>
              </p>
              <button
                type="button"
                className="text-[11px] text-muted px-1"
                onClick={() => setPastOpen(null)}
              >
                {s.close}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pastLane.clues.map((c, k) => (
                <span key={k} className="chip !py-0.5 !px-2 !text-[12px]">
                  <span className="num text-[10px] text-muted">{c.round}</span>
                  {c.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="mt-4 max-h-[40vh] overflow-y-auto overscroll-contain">
          <p className="text-[12px] text-muted mb-2 px-1">{s.yourClueLog}</p>
          <ClueGrid lanes={lanes} team={myTeam} lang={room.lang} />
        </div>
      )}
    </div>
  );
}

function EncryptWaiting({ room, myTeam, rounds, keys, theories, setTheory }: Ctx) {
  const enemy = OTHER[myTeam];
  const myLanes = buildLanes(rounds, myTeam, keys);
  const enemyLanes = buildLanes(rounds, enemy, null);
  const s = S(room.lang);

  return (
    <div className="px-4 pt-2 pb-8 space-y-4 fade-in">
      <p className="encrypt-wait-caption">{s.waitingEncryptors}</p>
      <div className="duel encrypt-wait-duel" role="group" aria-label={s.encryptorsAria}>
        {TEAMS.flatMap((team, i) => {
          const encUid = room.encryptor[team];
          const ready = room.cluesIn[team] === true;
          const color = TEAM_HEX[team];
          const fullName = encUid ? (room.players[encUid]?.name ?? s.qmark) : s.qmark;
          const display = fullName.split(" ")[0] || fullName;
          const side = (
            <div
              key={team}
              className={`side ${team === "gold" ? "a" : "b"}${ready ? " encrypt-wait-ready" : ""}`}
              style={{ color }}
            >
              <span className="sig">
                <TeamEmblem team={team} size={26} />
              </span>
              <span className="col">
                <span
                  className="nm"
                  title={fullName}
                  style={{ "--len": display.length } as CSSProperties}
                >
                  {display}
                </span>
                {ready ? (
                  <span className="encrypt-wait-check" aria-label={s.ready}>
                    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
                      <path
                        d="M2.5 7.2 5.6 10.2 11.5 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : (
                  <span className="encrypt-wait-dots" aria-label={s.writing}>
                    <i /><i /><i />
                  </span>
                )}
              </span>
            </div>
          );
          return i === 0
            ? [side]
            : [
                <div key="mid" className="mid" aria-hidden>
                  <span className="hair top" />
                  <span className="x">×</span>
                  <span className="hair bot" />
                </div>,
                side,
              ];
        })}
      </div>

      <div>
        <p className="text-[13px] font-medium mb-1 px-1">{s.enemyLog}</p>
        <p className="text-[12px] text-muted mb-2 px-1">
          {s.addGuesses}
        </p>
        <ClueGrid
          lanes={enemyLanes}
          team={enemy}
          theories={theories}
          onGuess={setTheory ? (n, t) => setTheory(n, t) : undefined}
          lang={room.lang}
        />
      </div>

      <div>
        <p className="text-[13px] font-medium mb-1 px-1">{s.yourLog}</p>
        <p className="text-[12px] text-muted mb-2 px-1">
          {s.reviewPast}
        </p>
        {rounds.length === 0 ? (
          <Empty title={s.firstRound} body={s.noLogYet} />
        ) : (
          <ClueGrid lanes={myLanes} team={myTeam} lang={room.lang} />
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* guess                                                              */
/* ================================================================== */

export function GuessPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, rounds, draft, actions, theories, setTheory } = ctx;
  // Round 1: both teams decrypt simultaneously — each owns their own half.
  const simultaneous = room.round < 2;
  const active = simultaneous ? myTeam : (room.activeTeam ?? "gold");
  const amOwner = myTeam === active;
  const amInterceptor = !simultaneous && myTeam === OTHER[active];
  const amEncryptor = room.encryptor[myTeam] === uid;

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [localDecrypt, setLocalDecrypt] = useState<(number | null)[] | null>(null);
  const [localIntercept, setLocalIntercept] = useState<(number | null)[] | null>(null);
  const s = S(room.lang);

  useEffect(() => {
    if (!draft) {
      setLocalDecrypt(null);
      setLocalIntercept(null);
      return;
    }
    setLocalDecrypt(draft.decrypt);
    setLocalIntercept(draft.intercept);
  }, [draft, active, simultaneous]);

  const activeClues = room.clues[active] ?? [];
  const decrypt = localDecrypt ?? draft?.decrypt ?? [null, null, null];
  const intercept = localIntercept ?? draft?.intercept ?? [null, null, null];

  const sentBy = amOwner
    ? draft?.submittedDecrypt ?? null
    : draft?.submittedIntercept ?? null;
  const sent = Boolean(sentBy);
  const values = amOwner ? decrypt : intercept;
  const complete = values.every((v) => v != null);
  const field: "decrypt" | "intercept" = amOwner ? "decrypt" : "intercept";

  const ownerLanes = buildLanes(rounds, active, amOwner ? keys : null);

  async function setField(next: (number | null)[]) {
    if (amOwner) setLocalDecrypt(next);
    else setLocalIntercept(next);
    try {
      await actions?.setCode(field, next);
    } catch (e) {
      setErr(errText(e, room.lang));
    }
  }

  async function send() {
    if (!actions || !complete || busy || sent) return;
    if (amOwner && amEncryptor) return;
    setBusy(true); setErr("");
    try {
      await actions.submit(uid, field);
    } catch (e) {
      setErr(errText(e, room.lang));
    } finally {
      setBusy(false);
    }
  }

  const encUid = room.encryptor[active];
  const encName = encUid ? (room.players[encUid]?.name ?? "—") : "—";
  const encColor = TEAM_HEX[active];

  // Silent encryptor: no clue set → skip this team's guess entirely.
  if (amOwner && activeClues.length !== 3) {
    return (
      <div className="px-4 py-8 fade-in">
        <Empty
          title={s.noCluesTitle}
          body={s.noCluesBody}
        />
      </div>
    );
  }

  // Following rounds: while own team decrypts and the enemy intercepts the
  // clues this encryptor wrote — split spectate. Round 1 has no intercept.
  // When this team is intercepting, same board as teammates.
  if (!simultaneous && amOwner && amEncryptor) {
    return (
      <EncryptorGuessWatch
        room={room}
        myTeam={myTeam}
        keys={keys}
        rounds={rounds}
        decrypt={decrypt}
        activeClues={activeClues}
        sentBy={sentBy}
      />
    );
  }

  const lockedOut = amOwner && amEncryptor;

  return (
    <div className="px-4 pt-3 pb-4 space-y-3 fade-in">
      <Banner>
        {amOwner ? (
          <>
            <span className="font-bold">{s.decryptFrom}</span>{" "}
            <span className="font-bold" style={{ color: encColor }}>{encName}</span>
          </>
        ) : (
          <>
            <span className="font-bold">{s.interceptFrom}</span>{" "}
            <span className="font-bold" style={{ color: encColor }}>{encName}</span>
          </>
        )}
      </Banner>

      {lockedOut && (
        <Banner tone="lock">
          {s.encryptorLocked}
        </Banner>
      )}

      <Cartouche
        values={values}
        clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
        onChange={
          sent || lockedOut ? undefined : (next) => setField(next)
        }
        tone={active}
        lang={room.lang}
        keyWords={amOwner ? keys : null}
        guessWords={
          amInterceptor
            ? [1, 2, 3, 4].map((n) => theories[String(n)] ?? "")
            : null
        }
        historyByDigit={
          amInterceptor
            ? ownerLanes.map((lane) => lane.clues.map((c) => c.text))
            : null
        }
      />

      <p className="text-[11.5px] text-muted text-center">
        {sent
          ? s.sentLocked
          : lockedOut
          ? s.waitingTeam
          : s.anyoneCanMove}
      </p>

      {/* Same order as EncryptorView: pads → send → record. Not fixed —
          a fixed dock sits under the Android keyboard when ClueGrid
          theory inputs are focused. */}
      {err && <Banner tone="warn">{err}</Banner>}

      <div className="border-t border-line pt-3">
        {sent ? (
          <div className="flex items-center justify-center py-2">
            <span className="text-[13.5px] text-muted">
              {s.sentByWaiting(room.players[sentBy!]?.name ?? s.you)}
            </span>
          </div>
        ) : lockedOut ? (
          <p className="text-center text-[13px] text-muted py-3">
            {s.waitingDecrypt}
          </p>
        ) : (
          <>
            <Btn className="w-full" disabled={!complete || busy} onClick={send}>
              {busy ? s.sending : amOwner ? s.sendDecrypt : s.sendIntercept}
            </Btn>
            <p className="text-[11px] text-muted text-center mt-2 leading-relaxed">
              {complete
                ? s.anyoneCanSend
                : s.completeThree}
            </p>
          </>
        )}
      </div>

      <SectionLine>
        {amOwner ? s.logYours : s.logOf(s.team[active])}
      </SectionLine>
      <ClueGrid
        lanes={ownerLanes}
        team={active}
        theories={amInterceptor ? theories : undefined}
        onGuess={amInterceptor ? (n, t) => setTheory?.(n, t) : undefined}
        lang={room.lang}
      />
    </div>
  );
}

/**
 * Own-team decrypt half (round ≥ 2): encryptor watches teammates decrypt
 * and the enemy intercept board live (same clues/history they see).
 */
function EncryptorGuessWatch({
  room, myTeam, keys, rounds, decrypt, activeClues, sentBy,
}: {
  room: Room;
  myTeam: TeamId;
  keys: string[] | null;
  rounds: RoundRecord[];
  decrypt: (number | null)[];
  activeClues: string[];
  sentBy: string | null;
}) {
  const enemy = OTHER[myTeam];
  const mineColor = TEAM_HEX[myTeam];
  const enemyColor = TEAM_HEX[enemy];
  const myLanes = buildLanes(rounds, myTeam, keys);
  const { draft: enemyDraft } = useDraft(room.id, enemy, room.round);
  const enemyIntercept = enemyDraft?.intercept ?? [null, null, null];
  const enemySentBy = enemyDraft?.submittedIntercept ?? null;
  const s = S(room.lang);

  return (
    <div className="pb-20">
      <div className="px-3 pt-1.5 space-y-1.5 fade-in">
        <p className="rounded-lg border border-[#3A2A5A] bg-[#1A1230] px-2.5 py-1 text-[11px] leading-snug text-[#B49CD8] text-center">
          {s.watchOnly}
        </p>

        <section
          className="rounded-lg border px-2 py-1.5 space-y-1"
          style={{ borderColor: `${mineColor}66`, background: `${mineColor}0F` }}
        >
          <header className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold" style={{ color: mineColor }}>
              {s.yourTeamDecrypts(s.team[myTeam])}
            </p>
            <span className="text-[9px] text-muted">{s.theyDecrypt}</span>
          </header>

          <Cartouche
            values={decrypt}
            clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
            tone={myTeam}
            keyWords={keys}
            showPads={false}
            size="dense"
            lang={room.lang}
          />
        </section>

        <section
          className="rounded-lg border px-2 py-1.5 space-y-1"
          style={{ borderColor: `${enemyColor}66`, background: `${enemyColor}0F` }}
        >
          <header className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold" style={{ color: enemyColor }}>
              {s.enemyIntercepts(s.team[enemy])}
            </p>
            <span className="text-[9px] text-muted">{s.theyInterceptLive}</span>
          </header>

          <Cartouche
            values={enemyIntercept}
            clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
            tone={enemy}
            historyByDigit={myLanes.map((lane) =>
              lane.clues.map((c) => c.text)
            )}
            showPads={false}
            size="dense"
            lang={room.lang}
          />
          <p className="text-[9px] text-muted text-center leading-tight">
            {enemySentBy
              ? s.interceptSentBy(room.players[enemySentBy]?.name ?? s.you)
              : s.watchingNumbers}
          </p>
        </section>
      </div>

      <div
        className="fixed inset-x-0 bg-ink/95 backdrop-blur-sm border-t border-line px-3 pt-1.5"
        style={{
          bottom: "calc(3.25rem + var(--safe-b))",
          paddingBottom: "6px",
        }}
      >
        <p className="text-center text-[11px] text-muted py-0.5 leading-snug">
          {sentBy
            ? s.sentByWaiting(room.players[sentBy]?.name ?? s.you)
            : s.waitingDecrypt}
        </p>
      </div>
    </div>
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

export function RevealPhase({ room, uid, myTeam, rounds, keys }: Ctx) {
  const rec = rounds.find((r) => r.round === room.round);
  // Round 1 (and any dual reveal): activeTeam is null — show both sides.
  const dual = room.activeTeam == null;
  const teams: TeamId[] = dual ? TEAMS : [room.activeTeam ?? "gold"];
  const s = S(room.lang);

  if (!rec || teams.some((t) => !rec.data?.[t])) {
    return (
      <div className="px-4 py-8 pb-36">
        <Empty title={s.revealing} />
        <HostContinue room={room} uid={uid} label={s.continue} />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3 pb-36">
      {teams.map((t) => (
        <RevealCard
          key={t}
          team={t}
          rec={rec}
          mine={t === myTeam}
          keys={t === myTeam ? keys : null}
          rounds={rounds}
          visible
          compact={dual}
          lang={room.lang}
        />
      ))}
      <HostContinue room={room} uid={uid} label={s.continue} />
    </div>
  );
}

function RevealCard({
  team, rec, mine, keys, rounds, visible, compact, lang = "ar",
}: {
  team: TeamId;
  rec: RoundRecord;
  mine: boolean;
  keys: string[] | null;
  rounds: RoundRecord[];
  visible: boolean;
  compact?: boolean;
  lang?: import("../lib/types").Lang;
}) {
  const s = S(lang);
  const side = rec.data[team];
  const opp = OTHER[team];
  const color = TEAM_HEX[team];
  // On this card: outcomes that hurt `team` help the viewer when !mine.
  const goodForViewer = !mine;
  const hasBreach = side.wasBreached;
  const hasFault = side.faulted;
  const dramatic = hasBreach || hasFault;
  // Decrypting team: keywords under their digits.
  // Prior-round clues only — same history interceptors had while guessing
  // (current round's clues were shown above the slots, never filed under digits yet).
  // Encryptor's team also needs this on the intercept attempt cartouche.
  const keyWords = mine ? keys : null;
  const priorHistoryByDigit = buildLanes(rounds, team, null).map((lane) =>
    lane.clues.filter((c) => c.round < rec.round).map((c) => c.text)
  );
  const decryptHistory = mine ? null : priorHistoryByDigit;
  const decryptOk = codesEqual(side.decrypt, side.code);
  const interceptOk =
    rec.round >= 2 && codesEqual(side.intercept, side.code);

  if (!visible) {
    return <div className="card h-32 grid place-items-center text-[13px] text-muted">…</div>;
  }

  return (
    <div
      className={`card fade-in ${dramatic ? "reveal-card-hit" : ""} ${compact ? "p-3" : "p-4"}`}
      style={{
        borderColor: dramatic
          ? (goodForViewer ? "#8FAE5C66" : "#F03B2E66")
          : `${color}44`,
      }}
    >
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-3"} min-h-[2rem]`}>
        <span className={`font-display ${compact ? "text-[15px]" : "text-[16px]"}`} style={{ color }}>
          {s.cipherOf(s.team[team])}
          {mine && <span className="text-[11px] text-muted ms-2">{s.yourTeam}</span>}
        </span>
      </div>

      {side.noClues ? (
        <Banner tone="warn">
          {s.noCluesWarn}
        </Banner>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col items-center">
            <p className="text-[11px] text-muted mb-1.5">{s.trueCode}</p>
            <div className="w-full max-w-[20rem]">
              <Cartouche
                values={side.code}
                clues={side.clues}
                tone={team}
                showPads={false}
                lang={lang}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 w-full">
            {(hasBreach || hasFault) && (
              <div className="reveal-stamps shrink-0" aria-label={s.roundResults}>
                {hasBreach && (
                  <div className="flex flex-col items-center gap-1">
                    <Stamp kind="breach" good={goodForViewer} lang={lang} />
                    <span className="reveal-stamp-cap">
                      {mine
                        ? s.theyBreachedYou(s.team[opp])
                        : s.youBreachedThem(s.team[team])}
                    </span>
                  </div>
                )}
                {hasFault && (
                  <div className="flex flex-col items-center gap-1">
                    <Stamp kind="fault" good={goodForViewer} lang={lang} />
                    <span className="reveal-stamp-cap">
                      {mine ? s.youFaulted : s.theyFaulted(s.team[team])}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ms-auto → visual left under dir=rtl */}
            <div className="w-[9.5rem] shrink-0 space-y-2 ms-auto">
              <div>
                <p className="text-[10px] text-muted mb-1 leading-none flex items-center gap-1.5">
                  <span>{s.decryptOf(s.team[team])}</span>
                  <AttemptMark ok={decryptOk} lang={lang} />
                </p>
                <Cartouche
                  values={side.decrypt}
                  tone={team}
                  truth={side.code}
                  keyWords={keyWords}
                  historyByDigit={decryptHistory}
                  showPads={false}
                  size="xs"
                  lang={lang}
                />
              </div>
              {rec.round >= 2 && (
                <div>
                  <p className="text-[10px] text-muted mb-1 leading-none flex items-center gap-1.5">
                    <span>{s.interceptOf(s.team[opp])}</span>
                    <AttemptMark ok={interceptOk} lang={lang} />
                  </p>
                  <Cartouche
                    values={side.intercept}
                    tone={opp}
                    truth={side.code}
                    keyWords={keyWords}
                    historyByDigit={priorHistoryByDigit}
                    showPads={false}
                    size="xs"
                    lang={lang}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttemptMark({ ok, lang = "ar" }: { ok: boolean; lang?: import("../lib/types").Lang }) {
  const s = S(lang);
  return (
    <span
      className="num text-[13px] font-bold leading-none"
      style={{ color: ok ? "#8FAE5C" : "#F03B2E" }}
      aria-label={ok ? s.markOk : s.markBad}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}

/* ================================================================== */
/* round end                                                          */
/* ================================================================== */

const BREACH = "#8FAE5C";
const FAULT = "#F03B2E";

function tiebreakWhy(s: ReturnType<typeof S>): Record<TiebreakTrigger, string> {
  return {
    mixed: s.whyMixed,
    bothBreach: s.whyBothBreach,
    bothFault: s.whyBothFault,
    lastRound: s.whyLastRound,
  };
}

export function RoundEndPhase({ room, uid, away }: Ctx) {
  const isHost = room.hostUid === uid;
  const maxRounds = room.settings.maxRounds;
  const cellCount = maxRounds;
  const awaitingShowdown = room.showdown && !room.winner;
  const s = S(room.lang);
  const why = tiebreakWhy(s);

  const wanderers = away
    .filter((a) => a.count >= 2 || a.ms >= 10000)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5);

  const trigger = awaitingShowdown
    ? tiebreakTrigger(
        room.teams.gold.score,
        room.teams.silver.score,
        room.round,
        maxRounds,
      )
    : null;

  const gp = points(room.teams.gold.score);
  const sp = points(room.teams.silver.score);

  /** Showdown: every player. Otherwise: next encryptors only. */
  const duelSides = TEAMS.map((t) => {
    const members = room.teams[t].members;
    if (awaitingShowdown) {
      return {
        team: t,
        uids: members,
        you: members.includes(uid),
      };
    }
    const next = members[(room.teams[t].encryptorIdx + 1) % Math.max(members.length, 1)];
    return {
      team: t,
      uids: next ? [next] : [],
      you: !!next && next === uid,
    };
  });

  const continueLabel = room.winner
    ? s.finalResult
    : awaitingShowdown
    ? s.showdownTitle
    : s.nextRound;

  return (
    <div className="pb-36 space-y-4 fade-in">
      {awaitingShowdown && (
        <div className="mx-4 mt-2 px-3 py-2.5 rounded-xl bg-alarm/15 border border-alarm/40 space-y-1.5">
          <p className="text-[13px] text-alarm font-medium leading-snug">
            {s.tiebreakTitle}
          </p>
          <p className="text-[12px] text-alarm/85 leading-snug">
            {trigger ? why[trigger] : s.pointsTiedFallback}
          </p>
          {trigger && trigger !== "lastRound" && (
            <p className="text-[12px] text-alarm/85 leading-snug">
              {s.pointsTiedSo(gp, sp)}
            </p>
          )}
          {trigger === "lastRound" && (
            <p className="text-[12px] text-alarm/85 leading-snug">
              {s.eachGuessesFour}
            </p>
          )}
        </div>
      )}
      <div className="rend-strip">
        <span className="rend-strip-label">{s.roundsLabel}</span>
        <div className="rend-strip-cells" aria-hidden>
          {Array.from({ length: cellCount }, (_, i) => {
            const n = i + 1;
            const done = n < room.round;
            const now = n === room.round;
            return (
              <span
                key={n}
                className={[
                  "rend-cell",
                  done ? "rend-cell-done" : "",
                  now ? "rend-cell-now" : "",
                ].filter(Boolean).join(" ")}
              />
            );
          })}
        </div>
        <span className="rend-strip-left num">
          {room.round}/{maxRounds}
        </span>
      </div>

      <div className="px-4 space-y-4">
      <section className="rend-sec">
        <div className="rend-sec-body">
          {TEAMS.map((t) => {
            const score = room.teams[t].score;
            return (
              <div key={t} className="rend-row">
                <span className="font-display text-[15px] truncate" style={{ color: TEAM_HEX[t] }}>
                  {s.team[t]}
                </span>
                <span className="rend-score-side">
                  <span className="rend-score-unit" title={s.breach}>
                    <span className="rend-score-n" style={{ color: BREACH }}>{score.breach}</span>
                    <PipBoard n={score.breach} color={BREACH} title={s.breach} />
                    <span className="rend-score-lbl">{s.breach}</span>
                  </span>
                  <span className="w-px h-3 bg-line" />
                  <span className="rend-score-unit" title={s.fault}>
                    <span className="rend-score-n" style={{ color: FAULT }}>{score.fault}</span>
                    <PipBoard n={score.fault} color={FAULT} title={s.fault} />
                    <span className="rend-score-lbl">{s.fault}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="rend-sec-foot">
          {awaitingShowdown
            ? s.pointsLine(s.team.gold, gp, s.team.silver, sp)
            : s.twoBreachWin}
        </p>
      </section>

      <section className="rend-sec rend-sec-duel">
        <div
          className={`duel rend-duel${awaitingShowdown ? " rend-duel-roster" : ""}`}
          role="group"
          aria-label={awaitingShowdown ? s.showdownDuel : s.nextEncryptors}
        >
          {duelSides.flatMap(({ team, uids, you }, i) => {
            const color = TEAM_HEX[team];
            const side = (
              <div
                key={team}
                className={`side ${team === "gold" ? "a" : "b"}${you ? " you" : ""}`}
                style={{ color }}
              >
                <span className="sig">
                  <TeamEmblem team={team} size={32} />
                </span>
                <span className="col">
                  {uids.map((u) => {
                    const fullName = room.players[u]?.name ?? s.qmark;
                    const display = fullName.split(" ")[0] || fullName;
                    const mine = u === uid;
                    return (
                      <span key={u} className="rend-duel-name-row">
                        <span
                          className="nm"
                          title={fullName}
                          style={{ "--len": display.length } as CSSProperties}
                        >
                          {display}
                        </span>
                        {mine && <span className="you-tag">{s.youTag}</span>}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
            return i === 0
              ? [side]
              : [
                  <div key="mid" className="mid" aria-hidden>
                    <span className="hair top" />
                    <span className="x">×</span>
                    <span className="hair bot" />
                  </div>,
                  side,
                ];
          })}
        </div>
      </section>

      {wanderers.length > 0 && (
        <section className="rend-sec rend-sec-away">
          <div className="rend-sec-head">
            <span>{s.leftScreen}</span>
            <span className="rend-sec-counter num">{wanderers.length}</span>
          </div>
          <div className="rend-sec-body">
            {wanderers.map((a) => (
              <div key={a.uid} className="rend-row">
                <span className="truncate text-[14px]">
                  {room.players[a.uid]?.name ?? s.qmark}
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="rend-away-count">{a.count}×</span>
                  <span className="rend-away-ms">{Math.round(a.ms / 1000)}{s.sec}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      {isHost && (
        <HostContinue
          room={room}
          uid={uid}
          label={continueLabel}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* showdown                                                           */
/* ================================================================== */

export function ShowdownPhase({
  room, myTeam, rounds, guessWords, setGuessWord, guessSubmittedAt,
}: Ctx) {
  const enemy = OTHER[myTeam];
  const alreadyIn = room.showdownIn?.[myTeam] === true || guessSubmittedAt != null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentLocal, setSentLocal] = useState(false);
  const autoSent = useRef(false);
  const wordsRef = useRef(guessWords);
  wordsRef.current = guessWords;
  const enemyLanes = buildLanes(rounds, enemy, null);
  const sent = alreadyIn || sentLocal;
  const s = S(room.lang);

  async function send() {
    if (alreadyIn || sentLocal || busy) return;
    setBusy(true); setErr("");
    try {
      const words = ["1", "2", "3", "4"].map((n) => (wordsRef.current[n] ?? "").trim());
      await api.submitShowdown({ roomId: room.id, words });
      setSentLocal(true);
    } catch (e) {
      setErr(errText(e, room.lang));
    } finally {
      setBusy(false);
    }
  }

  // Auto-submit at the visible deadline so resolve reads a locked sheet.
  useEffect(() => {
    if (sent || autoSent.current || !room.phaseEndsAt || room.paused) return;
    const left = Math.max(0, room.phaseEndsAt - syncedNow());
    const t = setTimeout(() => {
      if (autoSent.current) return;
      autoSent.current = true;
      void send();
    }, left + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, room.phaseEndsAt, room.paused, room.id]);

  return (
    <div className="px-3 pt-2 pb-6 fade-in space-y-3">
      <div className="px-3 py-2.5 rounded-xl bg-alarm/15 border border-alarm/40">
        <p className="text-[13px] text-alarm font-medium leading-snug">
          {s.showdownBanner(room.round)}
        </p>
        <p className="text-[11px] text-alarm/70 mt-1 leading-snug">
          {s.showdownTime}
        </p>
      </div>

      <div className="card overflow-hidden divide-y divide-line">
        {[1, 2, 3, 4].map((n) => {
          const lane = enemyLanes[n - 1];
          const clueLine = lane.clues.map((c) => c.text).join(" · ") || "—";
          const key = String(n);
          return (
            <div key={n} className="px-3 py-2.5 flex items-start gap-2.5">
              <span
                className="num shrink-0 w-6 h-6 mt-1.5 rounded-md grid place-items-center text-[13px] font-bold"
                style={{
                  color: TEAM_HEX[enemy],
                  background: `${TEAM_HEX[enemy]}22`,
                  border: `1px solid ${TEAM_HEX[enemy]}55`,
                }}
              >
                {n}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] text-muted truncate" title={clueLine}>
                  {clueLine}
                </p>
                <SharedGuessInput
                  n={key}
                  remote={guessWords[key] ?? ""}
                  disabled={sent}
                  showQMark={false}
                  placeholder={s.opponentWord}
                  className="w-full bg-[#1B1A14] border border-line rounded-lg px-3 py-2 text-parch placeholder:text-[#6E6858] focus:border-gold focus:outline-none disabled:opacity-60"
                  onGuess={(digit, text) => {
                    wordsRef.current = { ...wordsRef.current, [digit]: text };
                    setGuessWord?.(digit, text);
                  }}
                  lang={room.lang}
                />
              </div>
            </div>
          );
        })}
      </div>

      {err && <Banner tone="warn">{err}</Banner>}

      {sent ? (
        <Empty title={s.guessSent} body={s.waitingOther} />
      ) : (
        <Btn className="w-full" disabled={busy || !setGuessWord} onClick={() => void send()}>
          {busy ? "…" : s.sendGuess}
        </Btn>
      )}

      {(room.showdownIn?.gold || room.showdownIn?.silver) && (
        <div className="flex justify-center gap-4 pt-1 text-[12px]">
          {TEAMS.map((t) => (
            <span
              key={t}
              style={{ color: room.showdownIn?.[t] ? TEAM_HEX[t] : undefined }}
              className={room.showdownIn?.[t] ? "font-medium" : "text-muted"}
            >
              {s.team[t]}
              {room.showdownIn?.[t] ? " ✓" : " …"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
