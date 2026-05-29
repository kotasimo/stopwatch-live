import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { StopwatchCard } from "./stopwatchCard";
import { LapTable } from "./LapTable";
import { LapLatest } from "./LapLatest";
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

type Screen = "home" | "stopwatch" | "race";
type Variant = "A" | "B" | "C" | "D" | "D2" | "E";
type GridColumns = 1 | 2 | 3 | 4;
type RaceStatus = "setup" | "ready" | "running" | "stopped";
type Athlete = {
  id: string;
  name: string;
};
type RaceGroup = {
  id: string;
  athleteIds: string[];
  laps: Lap[];
  showLaps: boolean;
};
type LiveRole = "host" | "viewer";
type StopwatchLiveSnapshot = {
  mode: "stopwatch";
  variant: Variant;
  gridColumns: GridColumns;
  sharedElapsedTime: number;
  sharedStatus: "idle" | "running" | "stopped";
  stopwatches: StopwatchItem[];
};
type RaceLiveSnapshot = {
  mode: "race";
  athletes: Athlete[];
  raceGroups: RaceGroup[];
  raceAthleteLaps: Record<string, Lap[]>;
  raceElapsedTime: number;
  raceStatus: RaceStatus;
};
type LiveSnapshot = StopwatchLiveSnapshot | RaceLiveSnapshot;

export default function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialRoomId = initialParams.get("room");
  const initialMode = initialParams.get("m");
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
    initialRoomId ? (initialMode === "race" ? "race" : "stopwatch") : "home",
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
  const [athletes, setAthletes] = useState<Athlete[]>([
    { id: "athlete-1", name: "" },
    { id: "athlete-2", name: "" },
    { id: "athlete-3", name: "" },
  ]);
  const [raceGroups, setRaceGroups] = useState<RaceGroup[]>([]);
  const [raceAthleteLaps, setRaceAthleteLaps] = useState<Record<string, Lap[]>>(
    {},
  );
  const [raceStatus, setRaceStatus] = useState<RaceStatus>("setup");
  const [isRaceEditing, setIsRaceEditing] = useState(false);
  const [raceElapsedTime, setRaceElapsedTime] = useState(0);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [raceGridColumns, setRaceGridColumns] = useState<GridColumns>(2);
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (raceStatus !== "running" || raceStartedAt === null) return;

      setRaceElapsedTime(Date.now() - raceStartedAt);
    }, 10);

    return () => clearInterval(interval);
  }, [raceStartedAt, raceStatus]);

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

  const formatRaceTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    const centiseconds = Math.floor((ms % 1000) / 10)
      .toString()
      .padStart(2, "0");

    return `${minutes}'${seconds}"${centiseconds}`;
  };

  const createRaceGroup = (athleteIds: string[], laps: Lap[] = []): RaceGroup => ({
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    athleteIds,
    laps,
    showLaps: false,
  });

  const addAthlete = () => {
    if (isLiveViewer) return;
    const existingIds = new Set(athletes.map((athlete) => athlete.id));
    let nextIndex = athletes.length + 1;
    while (existingIds.has(`athlete-${nextIndex}`)) {
      nextIndex += 1;
    }
    const newAthlete = { id: `athlete-${nextIndex}`, name: "" };

    setAthletes((prev) => [
      ...prev,
      newAthlete,
    ]);

    if (raceStatus !== "setup") {
      setRaceAthleteLaps((prev) => ({
        ...prev,
        [newAthlete.id]: [],
      }));
      setRaceGroups((prev) => {
        if (prev.length === 0) return [createRaceGroup([newAthlete.id])];

        const [firstGroup, ...rest] = prev;

        return [
          {
            ...firstGroup,
            athleteIds: [...firstGroup.athleteIds, newAthlete.id],
          },
          ...rest,
        ];
      });
    }
  };

  const updateAthleteName = (id: string, name: string) => {
    if (isLiveViewer) return;
    setAthletes((prev) =>
      prev.map((athlete) =>
        athlete.id === id ? { ...athlete, name } : athlete,
      ),
    );
  };

  const removeAthlete = (id: string) => {
    if (isLiveViewer) return;
    setAthletes((prev) => prev.filter((athlete) => athlete.id !== id));
    setSelectedAthleteIds((prev) => prev.filter((athleteId) => athleteId !== id));
  };

  const focusAthleteInput = (index: number) => {
    window.setTimeout(() => {
      document
        .querySelector<HTMLInputElement>(`[data-athlete-index="${index}"]`)
        ?.focus();
    }, 0);
  };

  const handleAthleteNameKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (index === athletes.length - 1) {
      if (raceStatus === "setup" || isRaceEditing) {
        addAthlete();
        focusAthleteInput(index + 1);
      }
      return;
    }

    focusAthleteInput(index + 1);
  };

  const startRace = () => {
    if (isLiveViewer) return;
    setSelectedAthleteIds([]);
    setRaceStartedAt(Date.now() - raceElapsedTime);
    setRaceStatus("running");
  };

  const confirmRaceSetup = () => {
    if (isLiveViewer) return;
    if (raceStatus !== "setup") {
      setIsRaceEditing(false);
      return;
    }

    const activeAthleteIds = athletes
      .filter((athlete) => athlete.name.trim() !== "")
      .map((athlete) => athlete.id);

    if (activeAthleteIds.length === 0) return;

    setRaceGroups([createRaceGroup(activeAthleteIds)]);
    setRaceAthleteLaps(
      Object.fromEntries(activeAthleteIds.map((athleteId) => [athleteId, []])),
    );
    setSelectedAthleteIds([]);
    setRaceElapsedTime(0);
    setRaceStartedAt(null);
    setIsRaceEditing(false);
    setRaceStatus("ready");
  };

  const stopRace = () => {
    if (isLiveViewer) return;
    if (raceStatus !== "running") return;

    setRaceStatus("stopped");
    setRaceStartedAt(null);
  };

  const resetRace = () => {
    if (isLiveViewer) return;
    setRaceGroups([]);
    setRaceAthleteLaps({});
    setSelectedAthleteIds([]);
    setRaceElapsedTime(0);
    setRaceStartedAt(null);
    setIsRaceEditing(false);
    setRaceStatus("setup");
  };

  const toggleRaceLapHistory = (groupId: string) => {
    setRaceGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, showLaps: !group.showLaps }
          : group,
      ),
    );
  };

  const lapRaceGroup = (groupId: string) => {
    if (isLiveViewer) return;
    if (raceStatus !== "running") return;

    const targetGroup = raceGroups.find((group) => group.id === groupId);
    if (!targetGroup) return;

    setRaceAthleteLaps((prev) => {
      const next = { ...prev };

      targetGroup.athleteIds.forEach((athleteId) => {
        const athleteLaps = next[athleteId] ?? [];
        const previousTotal =
          athleteLaps.length > 0
            ? athleteLaps[athleteLaps.length - 1].totalTime
            : 0;
        const newLap: Lap = {
          lap: athleteLaps.length + 1,
          lapTime: raceElapsedTime - previousTotal,
          totalTime: raceElapsedTime,
        };

        next[athleteId] = [...athleteLaps, newLap];
      });

      return next;
    });
  };

  const toggleAthleteSelection = (athleteId: string) => {
    if (isLiveViewer) return;
    setSelectedAthleteIds((prev) =>
      prev.includes(athleteId)
        ? prev.filter((id) => id !== athleteId)
        : [...prev, athleteId],
    );
  };

  const moveSelectedAthletesToGroup = (targetGroupId: string) => {
    if (isLiveViewer || selectedAthleteIds.length === 0) return;

    setRaceGroups((prev) => {
      const movableIds = selectedAthleteIds.filter((athleteId) =>
        prev.some((group) => group.athleteIds.includes(athleteId)),
      );

      if (movableIds.length === 0) return prev;

      return prev
        .map((group) => {
          if (group.id === targetGroupId) {
            const nextAthleteIds = [
              ...group.athleteIds,
              ...movableIds.filter(
                (athleteId) => !group.athleteIds.includes(athleteId),
              ),
            ];

            return {
              ...group,
              athleteIds: nextAthleteIds,
            };
          }

          return {
            ...group,
            athleteIds: group.athleteIds.filter(
              (athleteId) => !movableIds.includes(athleteId),
            ),
          };
        })
        .filter((group) => group.athleteIds.length > 0);
    });
    setSelectedAthleteIds([]);
  };

  const moveSelectedAthletesToNewGroup = () => {
    if (isLiveViewer || selectedAthleteIds.length === 0) return;

    setRaceGroups((prev) => {
      const movableIds = selectedAthleteIds.filter((athleteId) =>
        prev.some((group) => group.athleteIds.includes(athleteId)),
      );

      if (movableIds.length === 0) return prev;

      const newGroup = createRaceGroup(movableIds);
      const updatedGroups = prev
        .map((group) => ({
          ...group,
          athleteIds: group.athleteIds.filter(
            (athleteId) => !movableIds.includes(athleteId),
          ),
        }))
        .filter((group) => group.athleteIds.length > 0);

      return [...updatedGroups, newGroup];
    });
    setSelectedAthleteIds([]);
  };

  const getAthleteName = (athleteId: string) =>
    athletes.find((athlete) => athlete.id === athleteId)?.name || "Unnamed";

  const getGroupDisplayLaps = (group: RaceGroup) => {
    const representativeAthleteId = group.athleteIds[0];

    return representativeAthleteId
      ? raceAthleteLaps[representativeAthleteId] ?? []
      : [];
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

  const cycleRaceGridColumns = () => {
    setRaceGridColumns((current) =>
      current === 4 ? 1 : ((current + 1) as GridColumns),
    );
  };

  const makeRoomId = () => {
    if ("randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  };

  const updateLiveUrl = (roomId: string, role: LiveRole, nextVariant: Variant) => {
    const params = new URLSearchParams();
    params.set("room", roomId);
    params.set("m", screen === "race" ? "race" : "stopwatch");
    if (screen !== "race") params.set("v", nextVariant);
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
    params.set("m", screen === "race" ? "race" : "stopwatch");
    if (screen !== "race") params.set("v", variant);
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
    if (snapshot.mode === "race") {
      setScreen("race");
      setAthletes(snapshot.athletes);
      setRaceAthleteLaps(snapshot.raceAthleteLaps ?? {});
      setRaceElapsedTime(snapshot.raceElapsedTime);
      setRaceStartedAt(
        snapshot.raceStatus === "running"
          ? now - snapshot.raceElapsedTime
          : null,
      );
      setRaceStatus(snapshot.raceStatus);
      setRaceGroups((current) =>
        snapshot.raceGroups.map((group) => {
          const localGroup = current.find((item) => item.id === group.id);

          return {
            ...group,
            showLaps: localGroup?.showLaps ?? false,
          };
        }),
      );
      return;
    }

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
    liveSnapshotRef.current =
      screen === "race"
        ? {
            mode: "race",
            athletes,
            raceGroups,
            raceAthleteLaps,
            raceElapsedTime,
            raceStatus,
          }
        : {
            mode: "stopwatch",
            variant,
            gridColumns,
            sharedElapsedTime,
            sharedStatus,
            stopwatches,
          };
  }, [
    athletes,
    gridColumns,
    raceElapsedTime,
    raceAthleteLaps,
    raceGroups,
    raceStatus,
    screen,
    sharedElapsedTime,
    sharedStatus,
    stopwatches,
    variant,
  ]);

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

          <button
            onClick={() => setScreen("race")}
            className="mb-4 w-full rounded-2xl border border-emerald-500/50 bg-emerald-700 px-5 py-4 text-left font-bold text-white hover:bg-emerald-600 active:scale-[0.98]"
          >
            <span className="text-lg mr-3">Race</span>
            <span className="text-emerald-100">Race Mode</span>
          </button>

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

  if (screen === "race") {
    const activeAthleteCount = athletes.filter(
      (athlete) => athlete.name.trim() !== "",
    ).length;
    const raceGridStyle = {
      "--stopwatch-columns": raceGridColumns,
    } as CSSProperties;

    return (
      <main className="min-h-screen bg-black px-4 py-5 pb-24 text-slate-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          {isLiveViewer && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-center text-sm font-semibold text-emerald-100">
              Live viewer mode
            </div>
          )}
          {liveRoomId && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-center text-xs text-slate-300">
              room: {liveRoomId} / realtime: {liveStatus}
            </div>
          )}
          <header className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase text-emerald-300">
                Race Mode
              </div>
              <div className="font-mono text-4xl font-bold tabular-nums">
                {formatRaceTime(raceElapsedTime)}
              </div>
            </div>

            <div className="flex gap-2">
              {!isLiveViewer && (
                <>
                  {raceStatus === "setup" || isRaceEditing ? (
                    <button
                      onClick={confirmRaceSetup}
                      disabled={activeAthleteCount === 0}
                      className="w-24 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Confirm
                    </button>
                  ) : raceStatus === "running" ? (
                    <button
                      onClick={stopRace}
                      className="w-24 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-400"
                    >
                      STOP
                    </button>
                  ) : (
                    <button
                      onClick={startRace}
                      className="w-24 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-400"
                    >
                      START
                    </button>
                  )}
                  <button
                    onClick={resetRace}
                    className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-white/15"
                  >
                    RESET
                  </button>
                </>
              )}
            </div>
          </header>
          {viewerUrl && !isLiveViewer && (
            <input
              readOnly
              value={viewerUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-emerald-500/30 bg-slate-950 px-3 py-2 text-xs text-emerald-100"
            />
          )}
          <div className="mobile-bottom-nav fixed bottom-0 left-0 z-40 w-full border-t border-slate-700 bg-slate-900/95 backdrop-blur xl:hidden">
            {viewerUrl && !isLiveViewer && (
              <div className="fixed bottom-16 left-3 right-3 z-40 rounded-xl border border-emerald-500/30 bg-slate-950/95 p-2">
                <input
                  readOnly
                  value={viewerUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg bg-black px-3 py-2 text-xs text-emerald-100"
                />
              </div>
            )}
            <div className="grid h-14 w-full grid-cols-5">
              {(raceStatus === "setup" || isRaceEditing) && !isLiveViewer ? (
                <button
                  onClick={addAthlete}
                  className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200"
                >
                  Add
                </button>
              ) : (
                <button
                  onClick={cycleRaceGridColumns}
                  className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200"
                >
                  {raceGridColumns}蛻・
                </button>
              )}
              <button
                onClick={() => setShowHistory(true)}
                className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200"
              >
                History
              </button>
              {!isLiveViewer ? (
                <button
                  onClick={showViewerUrl}
                  className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200"
                >
                  Share
                </button>
              ) : (
                <button
                  onClick={cycleRaceGridColumns}
                  className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200"
                >
                  {raceGridColumns}蛻・
                </button>
              )}
              <button
                onClick={() => {
                  if (
                    !isLiveViewer &&
                    raceStatus !== "setup"
                  ) {
                    setIsRaceEditing(true);
                  }
                }}
                disabled={isLiveViewer}
                className="h-full w-full border-r border-slate-700 text-sm font-bold text-slate-200 disabled:opacity-40"
              >
                Edit
              </button>
              <button
                onClick={() => setScreen("home")}
                className="h-full w-full text-sm font-bold text-slate-200"
              >
                Home
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="flex-1">
              {raceStatus === "setup" || isRaceEditing ? (
                <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold">Athletes</h2>
                  </div>

                  <div className="grid gap-2">
                    {athletes.map((athlete, index) => (
                      <div
                        key={athlete.id}
                        className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2"
                      >
                        <div className="text-right text-sm text-slate-500">
                          {index + 1}
                        </div>
                        <input
                          data-athlete-index={index}
                          value={athlete.name}
                          onChange={(e) =>
                            updateAthleteName(athlete.id, e.target.value)
                          }
                          onKeyDown={(e) => handleAthleteNameKeyDown(index, e)}
                          placeholder="Athlete name"
                          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        />
                        {raceStatus === "setup" ? (
                          <button
                            onClick={() => removeAthlete(athlete.id)}
                            className="rounded-lg bg-red-500/80 px-2 py-2.5 text-sm font-bold text-white"
                          >
                            X
                          </button>
                        ) : (
                          <div />
                        )}
                      </div>
                    ))}
                  </div>
                  {isRaceEditing && raceGroups.length > 0 && (
                    <div className="mt-5 border-t border-slate-700 pt-4">
                      <h3 className="mb-3 text-sm font-bold text-slate-300">
                        Groups
                      </h3>
                      <div
                        className="stopwatch-grid-phone grid"
                        style={raceGridStyle}
                      >
                        {raceGroups.map((group, index) => (
                          <div
                            key={group.id}
                            className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-slate-100">
                                Group {index + 1}
                              </div>
                              <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">
                                {group.athleteIds.length}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.athleteIds.map((athleteId) => {
                                const selected =
                                  selectedAthleteIds.includes(athleteId);

                                return (
                                  <button
                                    key={athleteId}
                                    onClick={() =>
                                      toggleAthleteSelection(athleteId)
                                    }
                                    className={`rounded-full border px-3 py-2 text-sm font-bold ${
                                      selected
                                        ? "border-emerald-300 bg-emerald-400 text-black"
                                        : "border-slate-600 bg-slate-800 text-slate-100"
                                    }`}
                                  >
                                    {getAthleteName(athleteId)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section
                  className="stopwatch-grid-phone grid"
                  style={raceGridStyle}
                >
              {raceGroups.map((group, index) => {
                const groupDisplayLaps = getGroupDisplayLaps(group);
                const latest = groupDisplayLaps.at(-1);
                const lastTotalTime = latest?.totalTime ?? 0;
                const liveLapTime = raceElapsedTime - lastTotalTime;
                const lastLapTime = latest?.lapTime ?? 0;
                return (
                  <article
                    key={group.id}
                    className="stopwatch-card mx-auto"
                  >
                    <div className="stopwatch-card-content">
                      <div className="stopwatch-card-header">
                        <div className="text-sm text-slate-400 w-6 text-center shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm font-bold text-slate-100">
                          Group {index + 1}
                        </div>
                        <button
                          onClick={() => toggleRaceLapHistory(group.id)}
                          className="stopwatch-icon-button bg-slate-700"
                        >
                          {groupDisplayLaps.length}
                        </button>
                      </div>

                      <div className="stopwatch-display-panel">
                        <LapLatest
                          laps={groupDisplayLaps}
                          formatTimeText={formatTimeText}
                          lapHistory={() => toggleRaceLapHistory(group.id)}
                          variant="B"
                          liveLapTime={liveLapTime}
                          lastLapTime={lastLapTime}
                        />

                      </div>

                      <div className="my-3 flex flex-wrap gap-2">
                        {group.athleteIds.map((athleteId) => {
                          const selected =
                            selectedAthleteIds.includes(athleteId);

                          return (
                            <button
                              key={athleteId}
                              onClick={() => toggleAthleteSelection(athleteId)}
                              className={`rounded-full border px-3 py-2 text-sm font-bold ${
                                selected
                                  ? "border-emerald-300 bg-emerald-400 text-black"
                                  : "border-slate-600 bg-slate-800 text-slate-100"
                              }`}
                            >
                              {getAthleteName(athleteId)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="stopwatch-controls-row">
                        <div className="mt-2 grid grid-cols-1 gap-3">
                          <button
                            onClick={() => lapRaceGroup(group.id)}
                            disabled={raceStatus !== "running"}
                            className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-inset ring-white/10 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            LAP
                          </button>
                        </div>
                      </div>
                    </div>

                    {group.showLaps && (
                      <div
                        className="lap-modal-overlay"
                        onClick={() => toggleRaceLapHistory(group.id)}
                      >
                        <section
                          className="lap-modal-content"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="mb-2 text-center text-lg font-bold">
                            Group {index + 1}
                          </div>
                          <div className="grid gap-3">
                            {group.athleteIds.map((athleteId) => (
                              <div key={athleteId}>
                                <div className="mb-1 text-center text-sm font-bold text-slate-200">
                                  {getAthleteName(athleteId)}
                                </div>
                                <LapTable
                                  laps={raceAthleteLaps[athleteId] ?? []}
                                  formatTimeText={formatTimeText}
                                />
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}
                  </article>
                );
              })}
                </section>
              )}
            </div>

            <div className="hidden flex-col gap-2 self-start xl:flex">
              {(raceStatus === "setup" || isRaceEditing) && !isLiveViewer && (
                <button
                  onClick={addAthlete}
                  className="rounded-full bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
                >
                  Add
                </button>
              )}
              <button
                onClick={() => setShowHistory(true)}
                className="rounded-full bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
              >
                History
              </button>
              {raceStatus !== "setup" && (
                <button
                  onClick={cycleRaceGridColumns}
                  className="rounded-full bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
                >
                  {raceGridColumns}列
                </button>
              )}
              {!isLiveViewer && (
                <button
                  onClick={showViewerUrl}
                  className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold hover:bg-emerald-600"
                >
                  Share
                </button>
              )}
              {!isLiveViewer && (
                <button
                  onClick={() => setIsRaceEditing(true)}
                  className="rounded-full bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => setScreen("home")}
                className="rounded-full bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
              >
                Home
              </button>
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {athletes.filter((athlete) => athlete.name.trim() !== "")
                      .length === 0 ? (
                      <div className="rounded-2xl bg-slate-900 p-4 text-slate-300">
                        No history yet
                      </div>
                    ) : (
                      athletes
                        .filter((athlete) => athlete.name.trim() !== "")
                        .map((athlete) => (
                        <div
                          key={athlete.id}
                          className="rounded-2xl bg-slate-900 p-4 shadow"
                        >
                          <div className="mb-3">
                            <div className="text-lg font-bold">
                              {athlete.name}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200">
                                {raceGroups.find((group) =>
                                  group.athleteIds.includes(athlete.id),
                                )
                                  ? `Group ${
                                      raceGroups.findIndex((group) =>
                                        group.athleteIds.includes(athlete.id),
                                      ) + 1
                                    }`
                                  : "No group"}
                              </span>
                            </div>
                          </div>
                          <LapTable
                            laps={raceAthleteLaps[athlete.id] ?? []}
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
          {selectedAthleteIds.length > 0 && !isLiveViewer && raceStatus !== "setup" && (
            <div className="fixed bottom-14 left-0 z-50 w-full border-t border-slate-700 bg-slate-950/95 p-3 text-slate-100 shadow-2xl backdrop-blur xl:bottom-0">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
                <div className="mr-2 text-sm font-bold text-emerald-200">
                  {selectedAthleteIds.length} selected
                </div>
                <button
                  onClick={moveSelectedAthletesToNewGroup}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold hover:bg-emerald-600"
                >
                  New Group
                </button>
                {raceGroups.map((group, index) => {
                  const hasSelectedInGroup = selectedAthleteIds.some(
                    (athleteId) => group.athleteIds.includes(athleteId),
                  );

                  return (
                    <button
                      key={group.id}
                      onClick={() => moveSelectedAthletesToGroup(group.id)}
                      disabled={hasSelectedInGroup}
                      className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Move to G{index + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setSelectedAthleteIds([])}
                  className="ml-auto rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15"
                >
                  Clear
                </button>
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
