import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AccountRequired } from "../components/AccountRequired.tsx";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  CornerDownLeft,
  Layers3,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useApp, api } from "../lib/app-context.tsx";
import { exercises, nextExercise } from "../../shared/learning.ts";
import type { GuideReply } from "../../shared/model.ts";
import { Button, Modal } from "../components/UI.tsx";

const lessons = [
  {
    id: "concentration",
    title: "Shared risk",
    description: "Why different companies can share the same risks.",
    icon: Layers3,
  },
  {
    id: "horizon",
    title: "Time horizon",
    description: "Connect your decisions to when you need the money.",
    icon: Clock3,
  },
  {
    id: "liquidity",
    title: "Money you need soon",
    description: "Keep near-term needs available.",
    icon: Clock3,
  },
  {
    id: "fees",
    title: "Costs and returns",
    description: "Understand what you keep after costs.",
    icon: Layers3,
  },
  {
    id: "evidence",
    title: "Check the evidence",
    description: "Sources, incentives, and uncertainty.",
    icon: ShieldCheck,
  },
  {
    id: "loss",
    title: "Loss and recovery",
    description: "Percentages change with the starting point.",
    icon: Layers3,
  },
  {
    id: "ownership",
    title: "What you own",
    description: "Separate practice units from real assets.",
    icon: ShieldCheck,
  },
  {
    id: "outcomes",
    title: "Reason before result",
    description: "Judge your process as well as the outcome.",
    icon: NotebookPen,
  },
] as const;
type LessonId = (typeof lessons)[number]["id"];

export function ExerciseDialog({ onClose }: { onClose: () => void }) {
  const { state, refresh } = useApp(),
    [exercise] = useState(() => nextExercise(state!)),
    [choice, setChoice] = useState<number | null>(null),
    [result, setResult] = useState<{
      correct: boolean;
      explanation: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    if (choice === null) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api("/exercise", "POST", {
          answer: choice,
          concept: exercise.concept,
          variant: exercise.variant,
        }),
      );
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="CHECK UNDERSTANDING" onClose={onClose}>
      <h2>{exercise.title}</h2>
      <p className="exercise-question">{exercise.prompt}</p>
      <div className="exercise-options">
        {exercise.options.map((option, index) => (
          <button
            disabled={!!result || busy}
            className={choice === index ? "selected" : ""}
            key={option}
            onClick={() => setChoice(index)}
          >
            <span>0{index + 1}</span>
            {option}
            {choice === index && <Check size={16} />}
          </button>
        ))}
      </div>
      {result ? (
        <div
          className={"exercise-feedback " + (result.correct ? "correct" : "")}
          role="status"
        >
          <strong>{result.correct ? "Correct" : "Not quite"}</strong>
          <p>{result.explanation}</p>
          <Button onClick={onClose}>
            Done <Check size={16} />
          </Button>
        </div>
      ) : (
        <Button
          disabled={choice === null || busy}
          onClick={() => void submit()}
          className="full-width"
        >
          {busy ? "Saving..." : "Check answer"}
          <ArrowRight size={16} />
        </Button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

type Message = {
  role: "you" | "guide";
  text: string;
  sources?: string[];
  mode?: "local" | "live";
  cached?: boolean;
};
export function Guide() {
  const { openAccount } = useOutletContext<{
    openAccount: (mode?: "login" | "register") => void;
  }>();
  const { state } = useApp(),
    [tab, setTab] = useState<"lessons" | "guide">("lessons"),
    [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [memories, setMemories] = useState(false),
    [exercise, setExercise] = useState(false),
    [selectedLesson, setSelectedLesson] = useState<LessonId | null>(null);
  if (!state) return null;
  const signedIn = state.session?.mode === "account";
  const canAsk = signedIn && state.role === "learner";
  const completed = new Set(
    state.attempts
      .filter((attempt) => attempt.correct)
      .map((attempt) => attempt.concept),
  );
  const completedCount = lessons.filter((lesson) =>
    completed.has(lesson.id),
  ).length;
  const next = nextExercise(state);
  async function ask(text: string) {
    if (!canAsk || !text.trim() || busy) return;
    setQuestion("");
    setMessages((previous) => [...previous, { role: "you", text }]);
    setBusy(true);
    try {
      const result = await api<GuideReply>("/guide", "POST", {
        question: text,
      });
      setMessages((previous) => [
        ...previous,
        {
          role: "guide",
          text: result.text,
          sources: result.sources,
          mode: result.mode,
          cached: result.cached,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        { role: "guide", text: (error as Error).message },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learn-page">
      <header className="simple-page-header">
        <h1>Learn investing</h1>
        {signedIn && (
          <button className="text-link" onClick={() => setMemories(true)}>
            <NotebookPen size={16} />
            Saved thoughts
          </button>
        )}
      </header>
      <div
        className="learn-tabs"
        role="tablist"
        aria-label="Learning"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const target = tab === "lessons" ? "guide" : "lessons";
            setTab(target);
            document.getElementById("learn-tab-" + target)?.focus();
          }
        }}
      >
        <button
          id="learn-tab-lessons"
          role="tab"
          aria-selected={tab === "lessons"}
          aria-controls="learn-lessons"
          tabIndex={tab === "lessons" ? 0 : -1}
          onClick={() => setTab("lessons")}
        >
          Lessons
        </button>
        <button
          id="learn-tab-guide"
          role="tab"
          aria-selected={tab === "guide"}
          aria-controls="learn-guide"
          tabIndex={tab === "guide" ? 0 : -1}
          onClick={() => setTab("guide")}
        >
          <MessageCircle size={15} />
          Ask Trove
        </button>
      </div>
      {tab === "lessons" ? (
        <section
          id="learn-lessons"
          role="tabpanel"
          aria-labelledby="learn-tab-lessons"
        >
          <div className="lesson-progress">
            <div>
              <strong>Your progress</strong>
              <span>
                {completedCount}/{lessons.length} lessons
              </span>
            </div>
            <div
              className="lesson-progress-track"
              role="progressbar"
              aria-label="Lessons completed"
              aria-valuemin={0}
              aria-valuemax={lessons.length}
              aria-valuenow={completedCount}
            >
              <span
                style={{ width: (completedCount / lessons.length) * 100 + "%" }}
              />
            </div>
          </div>
          <div className="lesson-list">
            {lessons.map((lesson) => {
              const done = completed.has(lesson.id),
                current = next.concept === lesson.id && !done,
                locked = !done && !current;
              const Icon = lesson.icon;
              return (
                <button
                  key={lesson.id}
                  className={
                    "lesson-row" +
                    (current ? " is-current" : "") +
                    (done ? " is-complete" : "")
                  }
                  disabled={locked}
                  aria-label={
                    (done ? "Review lesson: " : "Start lesson: ") + lesson.title
                  }
                  onClick={() => setSelectedLesson(lesson.id)}
                >
                  <span className="lesson-symbol">
                    <Icon size={22} strokeWidth={1.5} />
                  </span>
                  <span className="lesson-copy">
                    <strong>{lesson.title}</strong>
                    <small>{lesson.description}</small>
                  </span>
                  <span className="lesson-state">
                    {done ? (
                      <Check size={19} />
                    ) : locked ? (
                      <LockKeyhole size={17} />
                    ) : (
                      <ChevronRight size={21} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {completedCount === lessons.length && (
            <button className="text-link" onClick={() => setExercise(true)}>
              Try a new scenario <ArrowRight size={16} />
            </button>
          )}
          <p className="learning-limit-note">
            <ShieldCheck size={15} />
            Learning never changes your practice limits.
          </p>
        </section>
      ) : !canAsk ? (
        <section
          id="learn-guide"
          role="tabpanel"
          aria-labelledby="learn-tab-guide"
        >
          <AccountRequired
            compact
            title={
              signedIn
                ? "Ask from your learner account."
                : "Sign in to Ask Trove."
            }
            description={
              signedIn
                ? "Your learner can sign in to ask questions about their practice decisions."
                : "Get explanations that connect to your practice choices and what you have learned."
            }
            onSignIn={() => openAccount()}
            onCreate={signedIn ? undefined : () => openAccount("register")}
          />
        </section>
      ) : (
        <section
          className="simple-guide"
          id="learn-guide"
          role="tabpanel"
          aria-labelledby="learn-tab-guide"
        >
          <div className="simple-section-heading">
            <h2>Ask Trove</h2>
            <span>
              {state.session?.mode === "account" && state.session.memoryEnabled
                ? "Remembered guide"
                : "Local guide"}
            </span>
          </div>
          {messages.length === 0 ? (
            <div className="guide-starters">
              <p>What would you like to understand?</p>
              {[
                "Have I really spread my risk?",
                "What if my investments fall?",
              ].map((text) => (
                <button key={text} onClick={() => void ask(text)}>
                  {text}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="messages" aria-live="polite">
              {messages.map((message, index) => (
                <article
                  className={"message message-" + message.role}
                  key={index}
                >
                  <span className="mini-label">
                    {message.role === "you"
                      ? "YOU"
                      : message.mode === "live"
                        ? `TROVE / ${message.sources?.length ?? 0} SAVED THOUGHTS${message.cached ? " / SAVED REPLY" : ""}`
                        : "TROVE"}
                  </span>
                  <p>{message.text}</p>
                  {!!message.sources?.length && (
                    <button
                      className="source-link"
                      onClick={() => setMemories(true)}
                    >
                      View saved thoughts <ArrowUpRight size={13} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {busy && (
            <p className="guide-thinking" role="status">
              Thinking...
            </p>
          )}
          <form
            className="guide-input"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label className="sr-only" htmlFor="guide-question">
              Ask your learning guide
            </label>
            <input
              id="guide-question"
              placeholder="Ask a question"
              maxLength={1500}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button
              aria-label="Send question"
              type="submit"
              disabled={!question.trim() || busy}
            >
              <Send size={18} />
            </button>
          </form>
          <p className="guide-mode-note">
            {state.session?.memoryEnabled && state.session.servicesReady
              ? "Uses your saved learning context. Explains ideas; never changes your limits or places orders."
              : "Local guide. Enable remembering from the parent account for memory-backed AI explanations."}
          </p>
        </section>
      )}
      {selectedLesson && (
        <Modal title="LESSON" onClose={() => setSelectedLesson(null)}>
          <h2>
            {lessons.find((lesson) => lesson.id === selectedLesson)!.title}
          </h2>
          <p className="lesson-explanation">
            {exercises[selectedLesson].explanation}
          </p>
          {next.concept === selectedLesson && !completed.has(selectedLesson) ? (
            <Button
              onClick={() => {
                setSelectedLesson(null);
                setExercise(true);
              }}
            >
              Check understanding <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              to={
                selectedLesson === "concentration"
                  ? "/app/replay"
                  : "/app/explore"
              }
            >
              Try it in practice
            </Button>
          )}
        </Modal>
      )}
      {memories && <MemoryDialog onClose={() => setMemories(false)} />}
      {exercise && <ExerciseDialog onClose={() => setExercise(false)} />}
    </div>
  );
}
export function MemoryDialog({
  onClose,
  decisionId,
}: {
  onClose: () => void;
  decisionId?: string;
}) {
  const { state, update, busy, notify, refresh } = useApp(),
    [text, setText] = useState(""),
    [correcting, setCorrecting] = useState<string | null>(null),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!state?.session?.memoryEnabled) return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [state?.session?.memoryEnabled, state?.id, refresh]);
  if (!state) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update("/memories", {
        kind: correcting ? "correction" : "reflection",
        text,
        supersedes: correcting ?? undefined,
        decisionId: correcting
          ? state!.memories.find((memory) => memory.id === correcting)
              ?.decisionId
          : decisionId,
      });
      setText("");
      setCorrecting(null);
      notify("Thought saved.");
    } catch {
      /* displayed by provider */
    }
  }
  return (
    <Modal title="SAVED THOUGHTS" onClose={onClose} wide>
      <h2>Saved thoughts</h2>
      <p className="muted">
        {state.session?.memoryEnabled
          ? "New thoughts sync to Walrus Memory. Removing a thought excludes it from coaching; uploaded records may remain stored."
          : "Stored locally. Add, correct, or remove a thought."}
      </p>
      <div className="memory-list">
        {state.memories
          .filter((m) => m.active)
          .map((memory) => (
            <article key={memory.id}>
              <div className="memory-list-top">
                <span className="mini-label">
                  {memory.kind.toUpperCase()} ·{" "}
                  {memory.origin === "sample"
                    ? "SAMPLE HISTORY"
                    : "YOUR SAVED THOUGHT"}
                  {memory.origin !== "sample" && (
                    <span className="memory-sync">
                      {" "}
                      /{" "}
                      {memory.blobId
                        ? "MAINNET CONFIRMED"
                        : memory.syncStatus === "failed"
                          ? "SYNC NEEDS ATTENTION"
                          : ["pending", "accepted"].includes(
                                memory.syncStatus ?? "",
                              )
                            ? "SYNCING"
                            : "LOCAL"}
                    </span>
                  )}
                </span>
                <span>
                  {new Date(memory.recordedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p>“{memory.text}”</p>
              <div className="memory-actions">
                <button
                  className="text-link"
                  onClick={() => {
                    setCorrecting(memory.id);
                    setText("");
                    document.getElementById("reflection-text")?.focus();
                  }}
                >
                  Correct this thought <CornerDownLeft size={13} />
                </button>
                {confirmDelete === memory.id ? (
                  <>
                    <button
                      className="text-link loss"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          `/memories/${memory.id}`,
                          undefined,
                          "DELETE",
                        )
                          .then(() => setConfirmDelete(null))
                          .catch(() => {})
                      }
                    >
                      {memory.blobId || state.session?.memoryEnabled
                        ? "Remove from coaching"
                        : "Remove local memory"}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    className="icon-button"
                    aria-label="Remove memory"
                    onClick={() => setConfirmDelete(memory.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      <form className="reflection-form" onSubmit={save}>
        <label className="field-label" htmlFor="reflection-text">
          {correcting ? "Correction" : "Reflection"}
        </label>
        <textarea
          id="reflection-text"
          required
          maxLength={1500}
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            correcting
              ? "A more accurate way to put it is…"
              : "Something I understand differently now…"
          }
        />
        <div className="modal-actions">
          {correcting && (
            <button type="button" onClick={() => setCorrecting(null)}>
              Cancel correction
            </button>
          )}
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy
              ? "Saving…"
              : correcting
                ? "Save correction"
                : "Save reflection"}{" "}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
