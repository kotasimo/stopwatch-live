import { Controls } from "./Controls";
import { TimeDisplay } from "./TimeDisplay";
import { LapLatest } from "./LapLatest";
import { LapTable } from "./LapTable";
import "./stopwatch.css";

type Lap = {
  lap: number;
  lapTime: number;
  totalTime: number;
};

type StopwatchCardProps = {
  stopwatchId: number;
  name: string;
  elapsedTime: number;
  status: "idle" | "running" | "stopped";
  laps: Lap[];
  showLaps: boolean;
  variant: "A" | "B" | "C" | "D" | "D2" | "E";
  onChangeName: (id: number, name: string) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onReset: (id: number) => void;
  onLap: (id: number) => void;
  onToggleLapHistory: (id: number) => void;
  index: number;
  onDuplicate: (id: number) => void;
  onRemove: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnter: (id: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isNew?: boolean;
  readOnly?: boolean;
};

export const StopwatchCard = ({
  stopwatchId,
  name,
  elapsedTime,
  status,
  laps,
  showLaps,
  variant,
  onChangeName,
  onStart,
  onStop,
  onReset,
  onLap,
  onToggleLapHistory,
  index,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
  isNew,
  readOnly = false,
}: StopwatchCardProps) => {
  const isPhoneTwoColumnVariant =
    variant === "D" || variant === "D2" || variant === "E";

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 1000 / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const milliseconds = Math.floor((ms % 1000) / 10)
  .toString()
  .padStart(2, "0");

    return { minutes, seconds, milliseconds };
  };

  const formatTimeText = (ms: number) => {
    const minutes = Math.floor(ms / 60000);

    const seconds = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");

    const tenths = Math.floor((ms % 1000) / 100);

    return `${minutes}:${seconds}.${tenths}`;
  };

  const { minutes, seconds, milliseconds } = formatTime(elapsedTime);

  const latest = laps.at(-1);
  const lastTotalTime = latest?.totalTime ?? 0;
  const liveLapTime = elapsedTime - lastTotalTime;
  const lastLapTime = latest?.lapTime ?? 0;

  return (
    <div
      className={`stopwatch-card ${variant === "C" || variant === "E" ? "compact" : ""} ${isPhoneTwoColumnVariant ? "phone-two-column" : ""} ${isDragging ? "dragging" : ""} ${isNew ? "new-card" : ""}`}
      draggable={!readOnly}
      onDragStart={() => {
        if (!readOnly) onDragStart(stopwatchId);
      }}
      onDragEnter={() => {
        if (!readOnly) onDragEnter(stopwatchId);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}

    >
      <div className="stopwatch-card-content">
        <div className="stopwatch-card-header">
          {/* 左：番号 */}
          {variant !== "D" && variant !== "D2" && variant !== "E" && (
            <div className="text-sm text-slate-400 w-6 text-center shrink-0">
              {index}
            </div>
          )}

          <button
            onClick={() => onRemove(stopwatchId)}
            disabled={readOnly}
            className={`stopwatch-icon-button bg-red-500/70 ${readOnly ? "hidden" : ""}`}
          >
            ✕
          </button>
          {/* 中央：input */}
          <input
            value={name}
            onChange={(e) => onChangeName(stopwatchId, e.target.value)}
            className="min-w-0 name text-xs"
            placeholder="name"
            disabled={readOnly}
          />

          {/* 右：ボタンまとめる */}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onDuplicate(stopwatchId)}
              disabled={readOnly}
              className={`stopwatch-icon-button bg-blue-500/70 ${readOnly ? "hidden" : ""}`}
            >
              ＋
            </button>


          </div>
        </div>

        <div className="stopwatch-display-panel">
          <LapLatest
            laps={laps}
            formatTimeText={formatTimeText}
            lapHistory={() => onToggleLapHistory(stopwatchId)}
            variant={variant}
            liveLapTime={liveLapTime}
            lastLapTime={lastLapTime}
          />

          <div className="mt-0 border-t border-white/20 pt-0">
            {variant !== "C" && variant !== "D2" && variant !== "E" && (
              <div>
                {variant === "D" ? (
                  <div className="phone-primary-time">
                    <span className="phone-primary-time-main">
                      {minutes.toString().padStart(2, "0")}
                    </span>
                    <span className="phone-primary-time-mark">
                      '
                    </span>
                    <span className="phone-primary-time-main">
                      {seconds}
                    </span>
                    <span className="phone-primary-time-mark" translate="no">
                      "
                    </span>
                    <span className="phone-primary-time-sub">
                      {Math.floor(Number(milliseconds) / 100)}
                    </span>
                  </div>
                ) : (
                  <TimeDisplay
                    minutes={minutes}
                    seconds={seconds}
                    milliseconds={milliseconds}
                  />
                )}
              </div>
            )}
          </div>

        </div>

        <div className="stopwatch-controls-row">
          {!readOnly && (
            <Controls
              statusConf={status}
              onStart={
                variant === "C" || variant === "E" ? undefined : () => onStart(stopwatchId)
              }
              onStop={
                variant === "C" || variant === "E" ? undefined : () => onStop(stopwatchId)
              }
              onReset={
                variant === "D" || variant === "D2" || variant === "C" || variant === "E"
                  ? undefined
                  : () => onReset(stopwatchId)
              }
              onLap={() => onLap(stopwatchId)}
            />
          )}
        </div>
      </div>

      {
        showLaps && (
          <div
            className="lap-modal-overlay"
            onClick={() => onToggleLapHistory(stopwatchId)}
          >
            <section
              className="lap-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-lg font-bold mb-2 text-center">
                {name || "stopwatchName"}
              </div>
              <LapTable laps={laps} formatTimeText={formatTimeText} />
            </section>
          </div>
        )
      }
    </div >
  );
};
