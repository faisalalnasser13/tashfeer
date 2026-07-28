import { useEffect, useState } from "react";
import { api, errText } from "../lib/firebase";
import { useLocal } from "../lib/hooks";
import { Banner, Btn, Field, inputCls } from "../components/ui";

export function Home({ onEnter }: { onEnter: (roomId: string) => void }) {
  const [name, setName] = useLocal("tashfeer.name", "");
  const [code, setCode] = useState(() => sessionStorage.getItem("tashfeer.invite") ?? "");
  const [busy, setBusy] = useState<"" | "create" | "join">("");
  const [err, setErr] = useState("");

  const ready = name.trim().length > 0;
  const invited = Boolean(sessionStorage.getItem("tashfeer.invite"));

  // Arriving from a share link: name field first, code already filled.
  useEffect(() => {
    if (invited && ready) document.getElementById("join-btn")?.focus();
  }, [invited, ready]);

  async function create() {
    setErr(""); setBusy("create");
    try {
      const { roomId } = await api.createRoom({ name: name.trim(), avatar: 0 });
      onEnter(roomId);
    } catch (e) { setErr(errText(e)); setBusy(""); }
  }

  async function join() {
    setErr(""); setBusy("join");
    try {
      const { roomId } = await api.joinRoom({
        roomId: code.replace(/\D/g, "").slice(0, 4), name: name.trim(), avatar: 0,
      });
      onEnter(roomId);
    } catch (e) { setErr(errText(e)); setBusy(""); }
  }

  return (
    <div className="min-h-full flex flex-col px-5 pb-8" style={{ paddingTop: "calc(var(--safe-t) + 40px)" }}>
      <div className="text-center mb-9 fade-in">
        <h1 className="font-display text-[46px] leading-none text-gold tracking-tight">تشفير</h1>
        <p className="text-[13px] text-muted mt-3 leading-relaxed max-w-[19rem] mx-auto">
          مرّروا شفرتكم لفريقكم دون أن يلتقطها الخصم.
          <br />
          فريقان، أربع كلمات سرية لكل فريق، وثمانِ جولات.
        </p>
      </div>

      <div className="space-y-5 max-w-sm w-full mx-auto">
        <Field label="اسمك">
          <input
            className={inputCls}
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلًا: سعد بن صالح"
          />
        </Field>

        {err && <Banner tone="warn">{err}</Banner>}

        <Btn className="w-full" disabled={!ready || busy !== ""} onClick={create}>
          {busy === "create" ? "جارٍ الإنشاء…" : "أنشئ غرفة"}
        </Btn>

        <div className="flex items-center gap-3 py-1">
          <span className="flex-1 h-px bg-line" />
          <span className="text-[11px] text-muted">أو انضم بغرفة قائمة</span>
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
            placeholder="1234"
          />
          <Btn
            id="join-btn"
            variant={invited ? "primary" : "ghost"}
            className="shrink-0 px-6"
            disabled={!ready || code.length < 4 || busy !== ""}
            onClick={join}
          >
            {busy === "join" ? "…" : "انضم"}
          </Btn>
        </div>
      </div>

      <div className="flex-1" />
      <p className="text-center text-[11px] text-muted/70 mt-6 mb-1">
        مقتبسة من لعبة Decrypto لـ Le Scorpion Masqué
      </p>
    </div>
  );
}
