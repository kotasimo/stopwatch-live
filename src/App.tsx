import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { StopwatchCard } from "./stopwatchCard";
import { LapTable } from "./LapTable";
import { Analytics } from "@vercel/analytics/react";
import { INFO } from "./info";
import { supabase } from "./lib/supabase";

type Lap = {
  lap: number;
  lapTime: number;
  totalTime: number;
};

type StopwatchItem = {
  id: number;
  name: string;
  elapsedTime: number;
  status: "idle" | "running" | "stopped";
  laps: Lap[];
  showLaps: boolean;
  startedAt: number | null;
  isNew?: boolean;
};

type Screen = "home" | "stopwatch";
type Variant = "A" | "B" | "C" | "D" | "D2" | "E";
type GridColumns = 1 | 2 | 3 | 4;
type LiveRole = "host" | "viewer";
type LiveSnapshot = {
  variant: Variant;
  gridColumns: GridColumns;
  sharedElapsedTime: number;
  sharedStatus: "idle" | "running" | "stopped";
  stopwatches: StopwatchItem[];
};

export default function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialRoomId = initialParams.get("room");
  const initialVariant = initialParams.get("v") as Variant | null;
  const initialRole: LiveRole =
    initialParams.get("host") === "1" ? "host" : "viewer";

  const createStopwatch = (id: number): StopwatchItem => ({
    id,
    name: "",
    elapsedTime: 0,
    status: "idle",
    laps: [],
    showLaps: false,
    startedAt: null,
  });

  const [stopwatches, setStopwatches] = useState<StopwatchItem[]>([
    createStopwatch(1),
    createStopwatch(2),
    createStopwatch(3),
    // createStopwatch(4),
    // createStopwatch(5),
    // createStopwatch(6),
  ]);

  const [showHistory, setShowHistory] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [screen, setScreen] = useState<Screen>(
    initialRoomId ? "stopwatch" : "home",
  );
  const [variant, setVariant] = useState<Variant>(
    initialVariant &&
      ["A", "B", "C", "D", "D2", "E"].includes(initialVariant)
      ? initialVariant
      : "A",
  );
  const [gridColumns, setGridColumns] = useState<GridColumns>(2);
  const [sharedElapsedTime, setSharedElapsedTime] = useState(0);
  const [sharedStartedAt, setSharedStartedAt] = useState<number | null>(null);
  const [sharedStatus, setSharedStatus] =
    useState<"idle" | "running" | "stopped">("idle");
  const [liveRoomId, setLiveRoomId] = useState<string | null>(initialRoomId);
  const [liveRole, setLiveRole] = useState<LiveRole>(initialRole);
  const [liveStatus, setLiveStatus] = useState("offline");
  const [viewerUrl, setViewerUrl] = useState("");
  const liveChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const localBroadcastRef = useRef<BroadcastChannel | null>(null);
  const liveSnapshotRef = useRef<LiveSnapshot | null>(null);

  const isLiveHost = liveRoomId !== null && liveRole === "host";
  const isLiveViewer = liveRoomId !== null && liveRole === "viewer";

  const addStopwatch = () => {
    if (isLiveViewer) return;
    const newId = Date.now();
    setStopwatches((prev) => [...prev, createStopwatch(newId)]);
  };

  const updateStopwatch = (
    id: number,
    updater: (sw: StopwatchItem) => StopwatchItem,
  ) => {
    setStopwatches((prev) =>
      prev.map((sw) => (sw.id === id ? updater(sw) : sw)),
    );
  };

  const changeName = (id: number, name: string) => {
    if (isLiveViewer) return;
    updateStopwatch(id, (sw) => ({
      ...sw,
      name,
    }));
  };

  const startStopwatch = (id: number) => {
    if (isLiveViewer) return;
    updateStopwatch(id, (sw) => {
      if (sw.status === "running") return sw;

      return {
        ...sw,
        status: "running",
        startedAt: Date.now() - sw.elapsedTime,
      };
    });
  };

  const stopStopwatch = (id: number) => {
    if (isLiveViewer) return;
    updateStopwatch(id, (sw) => {
      if (sw.status !== "running") return sw;

      return {
        ...sw,
        status: "stopped",
        startedAt: null,
      };
    });
  };

  const startSharedTimer = () => {
    if (isLiveViewer) return;
    if (sharedStatus === "running") return;

    setSharedStatus("running");
    setSharedStartedAt(Date.now() - sharedElapsedTime);
  };

  const stopSharedTimer = () => {
    if (isLiveViewer) return;
    if (sharedStatus !== "running") return;

    setSharedStatus("stopped");
    setSharedStartedAt(null);
  };

  const resetSharedTimer = () => {
    if (isLiveViewer) return;
    setSharedStatus("idle");
    setSharedElapsedTime(0);
    setSharedStartedAt(null);

    setStopwatches((prev) =>
      prev.map((sw) => ({
        ...sw,
        laps: [],
        showLaps: false,
      }))
    );
  };

  const resetStopwatch = (id: number) => {
    if (isLiveViewer) return;
    updateStopwatch(id, (sw) => ({
      ...sw,
      status: "idle",
      elapsedTime: 0,
      laps: [],
      showLaps: false,
      startedAt: null,
    }));
  };

  const lapStopwatch = (id: number) => {
    if (isLiveViewer) return;
    updateStopwatch(id, (sw) => {
      const isC = variant === "C" || variant === "E";

      if (isC) {
        if (sharedStatus !== "running") return sw;
      } else {
        if (sw.status !== "running") return sw;
      }

      const totalTime = isC ? sharedElapsedTime : sw.elapsedTime;

      const previousTotal =
        sw.laps.length > 0 ? sw.laps[sw.laps.length - 1].totalTime : 0;

      const newLap: Lap = {
        lap: sw.laps.length + 1,
        lapTime: totalTime - previousTotal,
        totalTime,
      };

      return {
        ...sw,
        laps: [...sw.laps, newLap],
      };
    });
  };

  const toggleLapHistory = (id: number) => {
    updateStopwatch(id, (sw) => ({
      ...sw,
      showLaps: !sw.showLaps,
    }));
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStopwatches((prev) =>
        prev.map((sw) => {
          if (sw.status !== "running" || sw.startedAt === null) return sw;

          return {
            ...sw,
            elapsedTime: Date.now() - sw.startedAt,
          };
        }),
      );
    }, 10);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (sharedStatus !== "running" || sharedStartedAt === null) return;

      setSharedElapsedTime(Date.now() - sharedStartedAt);
    }, 10);

    return () => clearInterval(interval);
  }, [sharedStatus, sharedStartedAt]);

  const removeStopwatch = () => {
    if (isLiveViewer) return;
    setStopwatches((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  };

  const formatTimeText = (ms: number) => {
    const minutes = Math.floor(ms / 60000);

    const seconds = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");

    const tenths = Math.floor((ms % 1000) / 100);

    return `${minutes}:${seconds}.${tenths}`;
  };

  const minutes = Math.floor(sharedElapsedTime / 1000 / 60)
    .toString()
    .padStart(2, "0");

  const seconds = Math.floor((sharedElapsedTime / 1000) % 60)
    .toString()
    .padStart(2, "0");

  const centiseconds = Math.floor((sharedElapsedTime % 1000) / 10)
    .toString()
    .padStart(2, "0");



  const duplicateStopwatch = (id: number) => {
    if (isLiveViewer) return;
    setStopwatches((prev) => {
      const targetIndex = prev.findIndex((sw) => sw.id === id);
      if (targetIndex === -1) return prev;

      const target = prev[targetIndex];
      const newId = Date.now();

      const duplicated: StopwatchItem = {
        ...target,
        id: newId,
        name: target.name ? `${target.name} copy` : "copy",
        laps: [...target.laps],
        startedAt:
          target.status === "running" ? Date.now() - target.elapsedTime : null,
        isNew: true,
      };

      const updated = [...prev];
      updated.splice(targetIndex + 1, 0, duplicated);

      return updated;
    });
  };

  const removeStopwatchById = (id: number) => {
    if (isLiveViewer) return;
    setStopwatches((prev) => prev.filter((sw) => sw.id !== id));
  };

  const reorderStopwatch = (dragId: number, hoverId: number) => {
    if (isLiveViewer) return;
    setStopwatches((prev) => {
      const dragIndex = prev.findIndex((sw) => sw.id === dragId);
      const hoverIndex = prev.findIndex((sw) => sw.id === hoverId);

      if (dragIndex === -1 || hoverIndex === -1 || dragIndex === hoverIndex) {
        return prev;
      }

      const updated = [...prev];
      const [draggedItem] = updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, draggedItem);

      return updated;
    });
  };

  const lang = navigator.language.startsWith("ja") ? "ja" : "en";

  const TEXTS = {
    ja: {
      add: "追加",
      delete: "削除",
      history: "履歴",
      noHistory: "まだ履歴はありません",
      defaultName: "stopwatchName",
      howToUse: "使い方",
      copySuffix: " コピー",
    },
    en: {
      add: "Add",
      delete: "Delete",
      history: "History",
      noHistory: "No history yet",
      defaultName: "stopwatchName",
      howToUse: "How to use",
      copySuffix: " copy",
    },
  } as const;

  const t = TEXTS[lang];
  const isPhoneGridVariant =
    variant === "D" || variant === "D2" || variant === "E";
  const gridStyle = {
    "--stopwatch-columns": gridColumns,
  } as CSSProperties;
  const cycleGridColumns = () => {
    setGridColumns((current) => (current === 4 ? 1 : ((current + 1) as GridColumns)));
  };

  const makeRoomId = () => {
    if ("randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  };

  const updateLiveUrl = (roomId: string, role: LiveRole, nextVariant: Variant) => {
    const params = new URLSearchParams();
    params.set("room", roomId);
    params.set("v", nextVariant);
    if (role === "host") params.set("host", "1");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };

  const ensureLiveHostRoom = () => {
    const roomId = liveRoomId ?? makeRoomId();
    setLiveRoomId(roomId);
    setLiveRole("host");
    updateLiveUrl(roomId, "host", variant);
    return roomId;
  };

  const showViewerUrl = () => {
    const roomId = ensureLiveHostRoom();
    const params = new URLSearchParams();
    params.set("room", roomId);
    params.set("v", variant);
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    setViewerUrl(url);
  };

  const goHome = () => {
    if (!isLiveViewer) {
      resetSharedTimer();
    }

    setStopwatches([
      createStopwatch(1),
      createStopwatch(2),
      createStopwatch(3),
    ]);
    setLiveRoomId(null);
    setLiveRole("host");
    setLiveStatus("offline");
    setViewerUrl("");
    window.history.replaceState(null, "", window.location.pathname);
    setScreen("home");
  };

  const applyLiveSnapshot = useCallback((snapshot: LiveSnapshot) => {
    const now = Date.now();
    setVariant(snapshot.variant);
    setSharedStatus(snapshot.sharedStatus);
    setSharedElapsedTime(snapshot.sharedElapsedTime);
    setSharedStartedAt(
      snapshot.sharedStatus === "running"
        ? now - snapshot.sharedElapsedTime
        : null,
    );
    setStopwatches((current) =>
      snapshot.stopwatches.map((sw) => {
        const localStopwatch = current.find((item) => item.id === sw.id);

        return {
          ...sw,
          showLaps: localStopwatch?.showLaps ?? false,
          startedAt: sw.status === "running" ? now - sw.elapsedTime : null,
        };
      }),
    );
  }, []);

  const broadcastLiveSnapshot = useCallback(() => {
    if (!isLiveHost || !liveChannelRef.current || !liveSnapshotRef.current) {
      return;
    }

    liveChannelRef.current.send({
      type: "broadcast",
      event: "state",
      payload: liveSnapshotRef.current,
    });
    localBroadcastRef.current?.postMessage(liveSnapshotRef.current);
  }, [isLiveHost]);

  useEffect(() => {
    liveSnapshotRef.current = {
      variant,
      gridColumns,
      sharedElapsedTime,
      sharedStatus,
      stopwatches,
    };
  }, [gridColumns, sharedElapsedTime, sharedStatus, stopwatches, variant]);

  useEffect(() => {
    if (!liveRoomId) return;

    const localChannel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(`stopwatch:${liveRoomId}`)
        : null;

    localBroadcastRef.current = localChannel;
    if (localChannel) {
      localChannel.onmessage = ({ data }) => {
        if (liveRole === "viewer") {
          applyLiveSnapshot(data as LiveSnapshot);
        }
      };
    }

    const channel = supabase
      .channel(`stopwatch:${liveRoomId}`)
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (liveRole === "viewer") {
          applyLiveSnapshot(payload as LiveSnapshot);
        }
      })
      .subscribe((status) => {
        setLiveStatus(status);
        if (status === "SUBSCRIBED" && liveRole === "host") {
          window.setTimeout(broadcastLiveSnapshot, 0);
        }
      });

    liveChannelRef.current = channel;

    return () => {
      liveChannelRef.current = null;
      localBroadcastRef.current = null;
      localChannel?.close();
      supabase.removeChannel(channel);
    };
  }, [applyLiveSnapshot, broadcastLiveSnapshot, liveRoomId, liveRole]);

  useEffect(() => {
    if (!isLiveHost) return;

    const interval = window.setInterval(broadcastLiveSnapshot, 250);
    return () => clearInterval(interval);
  }, [broadcastLiveSnapshot, isLiveHost]);

  if (screen === "home") {
    return (
      <main className="min-h-screen bg-black text-slate-100 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold mb-8 text-center">
            Stopwatch
          </h1>

          <div className="grid gap-3">
            {[
              ["A", "フル-SPLIT Time"],
              ["B", "フル-LAPのLiveTime"],
              ["C", "フル-同時スタート"],
              ["D", "コンパクト-Bと同じ"],
              ["D2", "コンパクト-DからtotalTime表示を抜いた"],
              ["E", "コンパクト-Cと同じ"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setVariant(value as Variant);
                  setScreen("stopwatch");
                }}
                className="w-full rounded-2xl bg-slate-900 border border-slate-700 px-5 py-4 text-left font-bold hover:bg-slate-800 active:scale-[0.98]"
              >
                <span className="text-lg mr-3">{value}</span>
                <span className="text-slate-300">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
            <p>LAPを記録すストップウォッチを複数使えます。</p>
            <p>ストップウォッチ中のLAPタイムをタップすると、各ラップの詳細が見られます。</p>
            <p>詳しくは下のiボタンへ</p>
          </div>
          <button
            onClick={() => setShowInfo(true)}
            className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold "
            translate="no"
          >
            i
          </button>

          {showInfo && (
            <div
              className="fixed inset-0 z-50 bg-slate-950/90 text-slate-100 overflow-y-auto"
              onClick={() => setShowInfo(false)}
            >
              <div className="flex justify-center items-center min-h-full p-6">
                <div
                  className="w-full max-w-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="rounded-2xl bg-slate-800 p-6 shadow">
                    <div className="mb-4 text-lg font-bold">{t.howToUse}</div>

                    <div className="text-sm text-slate-200 space-y-4">
                      {INFO[lang].map((item, i) => (
                        <div key={i}>
                          <div className="font-bold text-slate-100">
                            {item.title}
                          </div>
                          <div className="whitespace-pre-line">{item.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }


  return (

    <div className="app-screen min-h-screen bg-black text-slate-100 pb-24 overscroll-none">
      {(variant === "C" || variant === "E") && (
        <div className="shared-timer-bar fixed top-0 left-0 z-50 w-full bg-slate-950/95 border-b border-slate-700 py-3 font-mono tabular-nums">
          <div className="flex items-center justify-center gap-5">

            <span className="text-3xl font-bold">
              <div className="flex items-end font-mono tabular-nums">
                <span className="text-3xl font-bold">
                  {minutes}'{seconds}"
                </span>

                <span className="text-lg text-slate-300 ml-1">
                  {centiseconds}
                </span>
              </div>
            </span>

            {!isLiveViewer && (
              <>
                {sharedStatus !== "running" ? (
                  <button
                    onClick={startSharedTimer}
                    className="rounded-md bg-indigo-400 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    START
                  </button>
                ) : (
                  <button
                    onClick={stopSharedTimer}
                    className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    STOP
                  </button>
                )}

                <button
                  onClick={resetSharedTimer}
                  className="rounded-md bg-white/30 px-3 py-1.5 text-sm text-slate-100 hover:bg-white/10"
                >
                  RESET
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div className={`stopwatch-page-shell mx-auto w-full max-w-7xl py-10 ${variant === "C" || variant === "E" ? "has-shared-timer pt-20" : ""}`}>
        {isLiveViewer && (
          <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-center text-sm font-semibold text-emerald-100">
            Live viewer mode
          </div>
        )}
        {liveRoomId && (
          <div className="mb-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-center text-xs text-slate-300">
            room: {liveRoomId} / realtime: {liveStatus}
          </div>
        )}
        <div className="flex flex-col xl:flex-row gap-4">
          <div
            className="stopwatch-grid-phone grid flex-1"
            style={gridStyle}
          >
            {stopwatches.map((sw, index) => (
              <div
                key={sw.id}
                className={
                  isPhoneGridVariant
                    ? "w-full"
                    : "w-full max-w-[340px] mx-auto"
                }
              >
                <StopwatchCard
                  key={sw.id}
                  stopwatchId={sw.id}
                  name={sw.name}
                  elapsedTime={variant === "C" || variant === "E" ? sharedElapsedTime : sw.elapsedTime}
                  status={variant === "C" || variant === "E" ? sharedStatus : sw.status}
                  laps={sw.laps}
                  showLaps={sw.showLaps}
                  variant={variant}
                  onChangeName={changeName}
                  onStart={
                    variant === "C" || variant === "E"
                      ? () => startSharedTimer()
                      : startStopwatch
                  }

                  onStop={
                    variant === "C" || variant === "E"
                      ? () => stopSharedTimer()
                      : stopStopwatch
                  }

                  onReset={
                    variant === "C" || variant === "E"
                      ? () => resetSharedTimer()
                      : resetStopwatch
                  }
                  onLap={lapStopwatch}
                  onToggleLapHistory={toggleLapHistory}
                  onDuplicate={duplicateStopwatch}
                  index={index + 1}
                  onRemove={removeStopwatchById}
                  onDragStart={setDraggingId}
                  onDragEnter={(hoverId) => {
                    if (draggingId !== null) {
                      reorderStopwatch(draggingId, hoverId);
                    }
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  isDragging={draggingId === sw.id}
                  isNew={sw.isNew}
                  readOnly={isLiveViewer}

                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 self-start hidden xl:flex">
            <button
              onClick={addStopwatch}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold"
            >
              {t.add}
            </button>

            <button
              onClick={removeStopwatch}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold"
            >
              {t.delete}
            </button>

            <button
              onClick={() => setShowHistory(true)}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold"
            >
              {t.history}
            </button>
            <button
              onClick={cycleGridColumns}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold"
            >
              {gridColumns}列
            </button>
            {!isLiveViewer && (
              <button
                onClick={showViewerUrl}
                className="rounded-full bg-emerald-700 px-4 py-2 hover:bg-emerald-600 text-sm font-bold"
              >
                Share
              </button>
            )}
            {viewerUrl && (
              <input
                readOnly
                value={viewerUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-44 rounded-lg border border-emerald-500/30 bg-slate-950 px-3 py-2 text-xs text-emerald-100"
              />
            )}
            {/* <button
              onClick={() => setShowInfo(true)}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold "
              translate="no"
            >
              i
            </button> */}
            <button
              onClick={goHome}
              className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700 text-sm font-bold"
            >
              Home
            </button>
          </div>
          <div className="mobile-bottom-nav fixed bottom-0 left-0 w-full z-50 bg-slate-900/95 backdrop-blur border-t border-slate-700 xl:hidden flex">
            {viewerUrl && !isLiveViewer && (
              <div className="fixed bottom-16 left-3 right-3 z-50 rounded-xl border border-emerald-500/30 bg-slate-950/95 p-2">
                <input
                  readOnly
                  value={viewerUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg bg-black px-3 py-2 text-xs text-emerald-100"
                />
              </div>
            )}
            <div className={`mobile-bottom-nav-grid fixed bottom-0 left-0 z-50 grid h-14 w-full ${isLiveViewer ? "grid-cols-5" : "grid-cols-6"} border-t border-slate-700 bg-slate-900/95 backdrop-blur xl:hidden`}>
              <button
                onClick={addStopwatch}
                className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
              >
                {t.add}
              </button>

              <button
                onClick={removeStopwatch}
                className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700 "
              >
                {t.delete}
              </button>

              <button
                onClick={() => setShowHistory(true)}
                className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
              >
                {t.history}
              </button>


              <button
                onClick={cycleGridColumns}
                className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
              >
                {gridColumns}列
              </button>


              {/* <button
                onClick={() => setShowInfo(true)}
                className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
                translate="no"
              >
                i
              </button> */}

              {!isLiveViewer && (
                <button
                  onClick={showViewerUrl}
                  className="h-full w-full text-sm border-r border-slate-700 font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
                >
                  Share
                </button>
              )}

              <button
                onClick={goHome}
                className="h-full w-full text-sm font-bold text-slate-200 transition-all duration-100 hover:bg-slate-700 active:scale-95 active:bg-slate-700"
                translate="no"
              >
                Home
              </button>
            </div>
          </div>
        </div>
        {showHistory && (
          <div
            className="modal-overlay pb-24"
            onClick={() => setShowHistory(false)}
          >
            <div className="flex justify-center pt-10">
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className=" grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {stopwatches.length === 0 ? (
                    <div className="rounded-2xl bg-slate-900 p-4 text-slate-300">
                      {t.noHistory}
                    </div>
                  ) : (
                    stopwatches.map((sw, index) => (
                      <div
                        key={sw.id}
                        className="rounded-2xl bg-slate-900 p-4 shadow"
                      >
                        <div className="mb-2 flex items-center gap-5">
                          <div className="text-lg">{index + 1}</div>
                          <div className="text-lg font-bold ">
                            {sw.name || t.defaultName}
                          </div>
                        </div>

                        <LapTable
                          laps={sw.laps}
                          formatTimeText={formatTimeText}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showInfo && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/90 text-slate-100 overflow-y-auto"
            onClick={() => setShowInfo(false)}
          >
            <div className="flex justify-center items-center min-h-full p-6">
              <div
                className="w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="rounded-2xl bg-slate-800 p-6 shadow">
                  <div className="mb-4 text-lg font-bold">{t.howToUse}</div>

                  <div className="text-sm text-slate-200 space-y-4">
                    {INFO[lang].map((item, i) => (
                      <div key={i}>
                        <div className="font-bold text-slate-100">
                          {item.title}
                        </div>
                        <div className="whitespace-pre-line">{item.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Analytics />
    </div>
  );
}
