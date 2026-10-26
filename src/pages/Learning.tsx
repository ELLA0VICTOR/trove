import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CornerDownLeft,
  Send,
  Trash2,
} from "lucide-react";
import { useApp, api } from "../lib/app-context.tsx";
import { nextExercise } from "../../shared/learning.ts";
import type { GuideReply } from "../../shared/model.ts";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
import { PixelIcon } from "../components/Brand.tsx";

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
    try {
      setResult(
        await api("/exercise", "POST", {
          answer: choice,
          concept: exercise.concept,
        }),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A MINUTE FOR YOUR FUTURE SELF" onClose={onClose}>
      <PixelIcon kind="sprout" />
      <h2>{exercise.title}</h2>
      <p className="exercise-question">{exercise.prompt}</p>
      <div className="exercise-options">
        {exercise.options.map((option, index) => (
          <button
            disabled={!!result}
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
          className={`exercise-feedback ${result.correct ? "correct" : ""}`}
          role="status"
        >
          <strong>
            {result.correct
              ? "That’s a thought worth keeping."
              : "A good moment to look again."}
          </strong>
          <p>{result.explanation}</p>
          <p className="fine-print">
            This records a learning attempt. It does not change your practice
            limits.
          </p>
          <Button onClick={onClose}>
            Take the lesson with you <ArrowRight size={16} />
          </Button>
        </div>
      ) : (
        <Button
          disabled={choice === null || busy}
          onClick={() => void submit()}
          className="full-width"
        >
          {busy ? "Saving your thought…" : "Let’s think about it"}{" "}
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
type Message = { role: "you" | "guide"; text: string; sources?: string[] };
export function Guide() {
  const { state } = useApp(),
    [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [memories, setMemories] = useState(false),
    [exercise, setExercise] = useState(false);
  if (!state) return null;
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setQuestion("");
    setMessages((previous) => [...previous, { role: "you", text }]);
    setBusy(true);
    try {
      const result = await api<GuideReply>("/guide", "POST", {
        question: text,
      });
      setMessages((previous) => [
        ...previous,
        { role: "guide", text: result.text, sources: result.sources },
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
    <>
      <section className="page-heading guide-heading">
        <Eyebrow>A LITTLE COMPANY FOR YOUR CURIOSITY</Eyebrow>
        <h1>
          Your thinking.
          <br />
          <span className="accent">Room to grow.</span>
        </h1>
        <p>No perfect questions. No starting from scratch.</p>
      </section>
      <div className="guide-layout">
        <section className="conversation">
          <div className="conversation-top">
            <span>
              <span className="live-dot" /> YOUR LEARNING GUIDE
            </span>
            <span>SAMPLE GUIDE</span>
          </div>
          {messages.length === 0 ? (
            <div className="guide-introduction">
              <PixelIcon kind="memory" />
              <h2>Let’s follow a thought.</h2>
              <p>
                Bring a question, a decision, or something you’re still figuring
                out. We’ll start with what you already know.
              </p>
              <div className="suggested-questions">
                {[
                  "Have I really spread my risk?",
                  "What if my investments fall?",
                  "What should I revisit?",
                ].map((text) => (
                  <button key={text} onClick={() => void ask(text)}>
                    {text}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages" aria-live="polite">
              {messages.map((message, index) => (
                <article
                  className={`message message-${message.role}`}
                  key={index}
                >
                  <span className="mini-label">
                    {message.role === "you"
                      ? "YOUR THOUGHT"
                      : "A DIFFERENT PERSPECTIVE"}
                  </span>
                  <p>{message.text}</p>
                  {message.sources?.length ? (
                    <button
                      className="source-link"
                      onClick={() => setMemories(true)}
                    >
                      {message.sources.length} remembered{" "}
                      {message.sources.length === 1 ? "thought" : "thoughts"}{" "}
                      behind this <ArrowUpRight size={13} />
                    </button>
                  ) : null}
                </article>
              ))}
              {busy && (
                <p className="thinking">
                  Following the thread<span>…</span>
                </p>
              )}
            </div>
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
              placeholder="What’s on your money mind?"
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
          <p className="fine-print guide-disclosure">
            This local guide uses saved thoughts and authored learning rules. A
            live AI provider is not connected.
          </p>
        </section>
        <aside className="guide-sidebar">
          <Eyebrow>WHAT WE’RE CARRYING FORWARD</Eyebrow>
          <h3>
            Your story
            <br />
            has a thread.
          </h3>
          <p>
            {state.memories.filter((m) => m.active).length} thoughts, choices,
            and reflections saved in this sample.
          </p>
          <blockquote>
            “
            {state.memories.find((m) => m.active && m.kind === "correction")
              ?.text ?? state.decisions.find((d) => d.reason)?.reason}
            ”
          </blockquote>
          <button className="text-link" onClick={() => setMemories(true)}>
            See or correct a memory <ArrowUpRight size={16} />
          </button>
          <div className="sidebar-lesson">
            <PixelIcon kind="sprout" />
            <span className="mini-label">YOUR NEXT LITTLE CHALLENGE</span>
            <h3>{nextExercise(state).title}</h3>
            <button className="text-link" onClick={() => setExercise(true)}>
              Try a thought <ArrowRight size={16} />
            </button>
          </div>
        </aside>
      </div>
      {memories && <MemoryDialog onClose={() => setMemories(false)} />}
      {exercise && <ExerciseDialog onClose={() => setExercise(false)} />}
    </>
  );
}
export function MemoryDialog({ onClose }: { onClose: () => void }) {
  const { state, update, busy, notify } = useApp(),
    [text, setText] = useState(""),
    [correcting, setCorrecting] = useState<string | null>(null),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!state) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update("/memories", {
        kind: correcting ? "correction" : "reflection",
        text,
        supersedes: correcting ?? undefined,
      });
      setText("");
      setCorrecting(null);
      notify("Your thought is saved. Your guide can use it next time.");
    } catch {
      /* displayed by provider */
    }
  }
  return (
    <Modal title="WHAT TROVE CARRIES FORWARD" onClose={onClose} wide>
      <h2>
        Your words.
        <br />
        <span className="accent">Your understanding.</span>
      </h2>
      <p className="muted">
        Saved locally for this sample family. You can add a reflection, correct
        an interpretation, or remove a memory.
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
                      Remove local memory
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
          {correcting
            ? "WHAT SHOULD THE GUIDE UNDERSTAND INSTEAD?"
            : "LEAVE A THOUGHT FOR YOUR FUTURE SELF"}
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
                : "Save my reflection"}{" "}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function LearningLink() {
  return (
    <Link to="/app/guide" className="text-link">
      Keep the conversation going <ArrowUpRight size={16} />
    </Link>
  );
}
