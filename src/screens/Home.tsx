import { useEffect, useState } from "react";
import { api, errText } from "../lib/firebase";
import { S } from "../lib/strings";
import type { Lang } from "../lib/types";
import { Banner, Btn, Field, inputCls } from "../components/ui";

export function Home({
  onEnter, initialCode, joinLang,
}: {
  onEnter: (roomId: string) => void;
  initialCode?: string;
  /** Set when opening a known room — join UI follows that room's language. */
  joinLang?: Lang;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(
    () => initialCode || sessionStorage.getItem("tashfeer.invite") || "",
  );
  const [busy, setBusy] = useState<"" | "create" | "join">("");
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState("");
  const joining = Boolean(joinLang);
  const flashLang: Lang = joinLang ?? "ar";

  const ready = name.trim().length > 0;

  useEffect(() => {
    try { localStorage.removeItem("tashfeer.name"); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  const run = async (fn: () => Promise<string>, lang: Lang) => {
    if (busy) return;
    if (!name.trim()) {
      setErr(S(lang).err.writeName);
      return;
    }
    setErr("");
    setBusy(joining ? "join" : "create");
    try { onEnter(await fn()); }
    catch (e) { setErr(errText(e, lang)); setBusy(""); }
  };

  if (picking && !joining) {
    return (
      <div className="min-h-full flex flex-col px-5 pb-8" style={{ paddingTop: "calc(var(--safe-t) + 40px)" }}>
        <div className="text-center mb-8 fade-in">
          <h1 className="font-display text-[40px] leading-none text-gold tracking-tight">تشفير</h1>
          <p className="font-display text-[22px] text-gold/70 mt-2 tracking-wide" dir="ltr">Cipher</p>
          <p className="text-[13px] text-muted mt-4 leading-relaxed">{S("ar").pickLang}</p>
          <p className="text-[12px] text-muted/70 mt-1 leading-relaxed">{S("ar").pickLangHint}</p>
        </div>
        <div className="space-y-3 max-w-sm w-full mx-auto">
          {err && <Banner tone="warn">{err}</Banner>}
          <Btn className="w-full" disabled={busy !== ""}
            onClick={() => run(async () => (await api.createRoom({ name: name.trim(), avatar: 0, lang: "ar" })).roomId, "ar")}>
            {busy === "create" ? S("ar").creating : S("ar").arCta}
          </Btn>
          <Btn variant="ghost" className="w-full" disabled={busy !== ""}
            onClick={() => run(async () => (await api.createRoom({ name: name.trim(), avatar: 0, lang: "en" })).roomId, "en")}>
            {S("en").enCta}
          </Btn>
          <Btn variant="ghost" className="w-full" disabled={busy !== ""} onClick={() => setPicking(false)}>
            {S("ar").back}
          </Btn>
        </div>
      </div>
    );
  }

  if (joining) {
    const s = S(joinLang);
    const enter = () => run(async () => {
      const id = code.replace(/\D/g, "").slice(0, 4);
      await api.joinRoom({ roomId: id, name: name.trim(), avatar: 0 });
      return id;
    }, flashLang);

    return (
      <div className="min-h-full flex flex-col px-5 pb-8" style={{ paddingTop: "calc(var(--safe-t) + 40px)" }}>
        <div className="text-center mb-6 fade-in">
          <h1 className="font-display text-[32px] leading-none text-gold tracking-tight">{s.title}</h1>
        </div>

        <div className="max-w-sm w-full mx-auto rotate-[0.6deg] border border-[#8A7040] bg-[#2A2414] px-3.5 py-3 text-center shadow-[0_4px_0_#1A160C]">
          <small className="text-[11px] font-bold tracking-[.16em] text-gold/70">{s.invitedTo}</small>
          <div className="font-display text-[34px] leading-tight text-gold tracking-[0.18em]" dir="ltr">{code}</div>
        </div>

        <p className="mt-4 text-center text-[13.5px] leading-relaxed text-muted max-w-[19rem] mx-auto">{s.tagline}</p>

        <div className="space-y-3 max-w-sm w-full mx-auto mt-5">
          <input
            className={inputCls}
            maxLength={16}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={s.namePh}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
          />
          {err && <Banner tone="warn">{err}</Banner>}
          <Btn className="w-full" disabled={!ready || busy !== ""} onClick={enter}>
            {busy === "join" ? s.joining : s.joinCta}
          </Btn>
          <Btn variant="ghost" className="w-full" onClick={() => {
            sessionStorage.removeItem("tashfeer.invite");
            location.search = "";
          }}>
            {s.otherRoom}
          </Btn>
        </div>
      </div>
    );
  }

  const s = S("ar");
  const joinByCode = () => run(async () => {
    const id = code.replace(/\D/g, "").slice(0, 4);
    if (id.length < 4) throw new Error(s.err.noSuchRoom);
    await api.joinRoom({ roomId: id, name: name.trim(), avatar: 0 });
    return id;
  }, "ar");

  return (
    <div className="min-h-full flex flex-col px-5 pb-8" style={{ paddingTop: "calc(var(--safe-t) + 40px)" }}>
      <div className="text-center mb-9 fade-in">
        <h1 className="font-display text-[46px] leading-none text-gold tracking-tight">تشفير</h1>
        <p className="font-display text-[18px] text-gold/55 mt-1.5 tracking-[0.12em]" dir="ltr">CIPHER</p>
        <p className="text-[13px] text-muted mt-3 leading-relaxed max-w-[19rem] mx-auto">
          {s.tagline}
          <br />
          Pass your code to your team without the other side intercepting it.
        </p>
      </div>

      <div className="space-y-5 max-w-sm w-full mx-auto">
        <Field label={`${s.yourName} · your name`}>
          <input
            className={inputCls}
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder={s.namePh}
          />
        </Field>

        {err && <Banner tone="warn">{err}</Banner>}

        <Btn className="w-full" disabled={!ready || busy !== ""} onClick={() => {
          if (!name.trim()) return setErr(s.err.writeName);
          setPicking(true);
        }}>
          {s.openRoom} · Open a room
        </Btn>

        <div className="flex items-center gap-3 py-1">
          <span className="flex-1 h-px bg-line" />
          <span className="text-[11px] text-muted">{s.orJoin}</span>
          <span className="flex-1 h-px bg-line" />
        </div>

        <div className="flex gap-2">
          <input
            className={`${inputCls} num text-center tracking-[0.35em] font-display text-[20px]`}
            value={code}
            maxLength={4}
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => { if (e.key === "Enter") joinByCode(); }}
            placeholder="1234"
          />
          <Btn
            variant="ghost"
            className="shrink-0 px-6"
            disabled={!ready || code.length < 4 || busy !== ""}
            onClick={joinByCode}
          >
            {busy === "join" ? s.joining : s.join}
          </Btn>
        </div>
      </div>
    </div>
  );
}
