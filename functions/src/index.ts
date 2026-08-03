/**
 * Scheduled room purge — the one server-side job this project keeps.
 *
 * Stale rooms (no updatedAt bump for 6h) are wiped with recursiveDelete so
 * secret / rounds / deck / private / away / guesses / drafts / final don't
 * orphan. Firestore TTL is intentionally not used: it only deletes the
 * parent document.
 *
 * Requires Blaze. Cap each run so a backlog drains across days instead of
 * timing out a single invocation.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

initializeApp();

const STALE_MS = 6 * 60 * 60 * 1000;
/** Soft cap per run — next day's schedule continues the rest. */
const MAX_PER_RUN = 200;

export const purgeStaleRooms = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "Asia/Riyadh",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const cutoff = Date.now() - STALE_MS;
    const snap = await db
      .collection("rooms")
      .where("updatedAt", "<", cutoff)
      .orderBy("updatedAt", "asc")
      .limit(MAX_PER_RUN)
      .get();

    if (snap.empty) {
      logger.info("purgeStaleRooms: nothing stale", { cutoff });
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const doc of snap.docs) {
      try {
        // recursiveDelete walks all subcollections — preferred over the
        // client engine's bounded delete loops, which only know known paths.
        await db.recursiveDelete(doc.ref);
        ok += 1;
      } catch (err) {
        fail += 1;
        logger.error("purgeStaleRooms: delete failed", {
          roomId: doc.id,
          err,
        });
      }
    }

    logger.info("purgeStaleRooms: done", {
      candidates: snap.size,
      ok,
      fail,
      cutoff,
    });
  }
);
