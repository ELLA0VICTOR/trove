import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Brand, PixelIcon, Sapling } from "../components/Brand.tsx";
import { Button, Eyebrow, PixelReadout, Reveal } from "../components/UI.tsx";
import { LetterGlobe } from "../components/LetterGlobe.tsx";
import { useApp } from "../lib/app-context.tsx";

const steps = [
  [
    "Choose",
    "Start with a company you’re curious about. Make your first investment with practice money.",
  ],
  [
    "Remember",
    "Leave a little of your thinking behind. Your reasons matter as much as your choices.",
  ],
  [
    "Revisit",
    "See what happened. Replay the same moment with a different mix, and find the lesson.",
  ],
  [
    "Grow",
    "Carry what you learned into your next decision. A little more understanding, every time.",
  ],
];
export function Landing() {
  const { paused, setPaused } = useApp();
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#remember">Built to remember</a>
          <a href="#parents">For parents</a>
        </nav>
        <div className="header-actions">
          <Button to="/app" className="compact">
            Try now
          </Button>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="hero-intro">
            <h1>GROW YOUR OWN WAY.</h1>
            <p>
              A practice portfolio. A little curiosity.{" "}
              <strong>A wiser you.</strong>
            </p>
          </div>
          <div className="sphere-panel">
            <div className="sphere-top">
              <span>SMALL DECISIONS. LASTING GROWTH.</span>
              <button
                onClick={() => setPaused(!paused)}
                aria-label={paused ? "Resume animations" : "Pause animations"}
              >
                {paused ? <Play size={12} /> : <Pause size={12} />}
                {paused ? "RESUME" : "PAUSE"}
              </button>
            </div>
            <LetterGlobe />
          </div>
          <div className="hero-command">
            <p>
              Your future starts with understanding.
              <br />
              <strong>Let’s make your first move.</strong>
            </p>
            <div className="hero-actions">
              <a href="#how-it-works" className="text-link">
                Meet Trove <ArrowDown size={15} />
              </a>
              <Button to="/app">Plant your first seed</Button>
            </div>
          </div>
        </section>
        <div className="signal-strip" aria-hidden="true">
          <div>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index}>
                STAY CURIOUS <i>✳</i> MAKE YOUR OWN MOVES <i>✳</i> GROW WITH
                EVERY DECISION <i>✳</i>
              </span>
            ))}
          </div>
        </div>
        <section className="growth-band section" id="how-it-works">
          <div>
            <Eyebrow>01 / A DIFFERENT KIND OF GROWTH</Eyebrow>
            <Reveal>
              <h2>
                MORE THAN
                <br />A NUMBER.
              </h2>
              <p>
                Learning to invest shouldn’t start with a leap of faith. Start
                small. Ask questions. Understand what your decisions are
                teaching you.
              </p>
            </Reveal>
          </div>
          <Reveal className="growth-band-right" delay={90}>
            <span className="mini-label">
              YOUR LEARNING, ONE CHOICE AT A TIME
            </span>
            <PixelReadout value="01—04" />
            <div className="band-line">
              <span>YOUR CHOICE</span>
              <ArrowRight size={20} />
              <span>YOUR UNDERSTANDING</span>
            </div>
            <p>
              Practice with purpose.
              <br />
              Take the lesson with you.
            </p>
          </Reveal>
        </section>
        <section className="section pillars-section">
          <div className="section-heading">
            <Reveal>
              <Eyebrow>02 / MAKE IT YOURS</Eyebrow>
              <h2>
                A SMALL START.
                <br />
                <span className="accent">A WORLD TO LEARN.</span>
              </h2>
            </Reveal>
            <Reveal>
              <p>
                You don’t have to know everything.
                <br />
                You just need a place to begin.
              </p>
            </Reveal>
          </div>
          <div className="pillar-grid">
            {[
              [
                "01",
                "EXPLORE",
                "chart",
                "Curiosity is your capital.",
                "Get to know the companies behind everyday things. Build a practice portfolio, and start asking better questions.",
                "Explore companies",
                "/app/explore",
              ],
              [
                "02",
                "REMEMBER",
                "memory",
                "Your thinking stays with you.",
                "Your reasons, your reflections, your lightbulb moments. Revisit your own decisions with a guide that keeps the thread.",
                "Meet your guide",
                "/app/guide",
              ],
              [
                "03",
                "GROW",
                "sprout",
                "A lesson in every direction.",
                "Markets go up. Markets go down. Replay the moment, try another mix, and grow your understanding either way.",
                "Revisit a decision",
                "/app/replay",
              ],
            ].map(([number, label, icon, title, text, action, url], index) => (
              <Reveal key={number} className="pillar" delay={index * 90}>
                <span className="mini-label">
                  [ {number} / {label} ]
                </span>
                <PixelIcon kind={icon} />
                <span className="eyebrow accent">{label} YOUR OWN WAY</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link to={url} className="pillar-link">
                  {action}
                  <ArrowUpRight size={18} />
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="section journey-section">
          <div className="section-heading">
            <Reveal>
              <Eyebrow>03 / FROM A CHOICE TO A CHANGE</Eyebrow>
              <h2>
                CHOOSE. REFLECT. <span className="accent">GROW.</span>
              </h2>
            </Reveal>
            <Reveal>
              <p>
                Four simple steps.
                <br />A little wiser on the other side.
              </p>
            </Reveal>
          </div>
          <div className="journey-grid">
            {steps.map(([title, text], index) => (
              <Reveal key={title} delay={index * 90}>
                <div className="scan-line">
                  <span>0{index + 1}</span>
                  <ArrowRight size={18} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="section memory-section" id="remember">
          <div className="memory-copy">
            <Reveal>
              <Eyebrow>04 / NOT ANOTHER FRESH START</Eyebrow>
              <h2>
                YOU GROW.
                <br />
                TROVE <span className="accent">REMEMBERS.</span>
              </h2>
              <p>
                A new session shouldn’t mean starting over. Turn yesterday’s “I
                think” into tomorrow’s “I understand.”
              </p>
              <Button to="/app/decisions" secondary>
                See a decision unfold <ArrowUpRight size={18} />
              </Button>
            </Reveal>
          </div>
          <Reveal className="memory-story">
            <div className="story-label">
              <span className="live-dot" /> AN ILLUSTRATIVE LEARNING JOURNEY
            </div>
            <div className="story-entry">
              <span className="story-number">01</span>
              <div>
                <span className="mini-label">THE ORIGINAL THOUGHT</span>
                <blockquote>
                  “Five different companies.
                  <br />
                  That means I’ve spread my risk.”
                </blockquote>
              </div>
            </div>
            <div className="story-entry">
              <span className="story-number">02</span>
              <div>
                <span className="mini-label">THE LIGHTBULB MOMENT</span>
                <p>
                  Different names.
                  <br />
                  The same industry.
                  <br />
                  <strong>Some of the same risks.</strong>
                </p>
              </div>
            </div>
            <div className="story-entry last">
              <PixelIcon kind="sprout" />
              <div>
                <span className="mini-label accent">THE NEXT CHOICE</span>
                <p>
                  A different mix.
                  <br />A little more understanding.
                </p>
              </div>
            </div>
          </Reveal>
        </section>
        <section className="parents-section section" id="parents">
          <div>
            <Eyebrow>05 / INDEPENDENCE, WITH ROOTS</Eyebrow>
            <Reveal>
              <h2>
                ROOM TO GROW.
                <br />
                ROOTS TO RELY ON.
              </h2>
              <p>
                Give them space to make their own choices. Set clear practice
                boundaries, follow their learning, and be there when they need a
                little guidance.
              </p>
              <Button to="/app/parent">
                Explore the parent view <ArrowUpRight size={18} />
              </Button>
            </Reveal>
          </div>
          <div className="parent-art" aria-hidden="true">
            <div className="plant-grid" />
            <Sapling className="large-sapling" pixel />
            <div className="plant-ground" />
            <span>
              INDEPENDENCE ↑<br />
              UNDERSTANDING ↓
            </span>
          </div>
        </section>
        <section className="section faq-section" id="questions">
          <Reveal>
            <Eyebrow>06 / A LITTLE CLARITY</Eyebrow>
            <h2>
              GOOD QUESTIONS.
              <br />
              <span className="accent">HONEST ANSWERS.</span>
            </h2>
          </Reveal>
          <div className="faq-list">
            {[
              [
                "Am I investing real money?",
                "No. This version of Trove uses practice money and simulated positions. You are learning how investing decisions work, without buying shares or moving real funds.",
              ],
              [
                "What can I try right now?",
                "Explore companies and funds with real market prices, then create a family account to practise buying and selling. Save your reasons, revisit decisions, compare investment mixes, and work through short investing lessons.",
              ],
              [
                "What does Trove remember?",
                "With parent-enabled remembering, your investment reasons, reflections, corrections, and learning exercises sync to Walrus Memory on Mainnet. Ask Trove uses confirmed saved thoughts to explain ideas in your own context, including when you return in another session.",
              ],
              [
                "How do parent boundaries work?",
                "Parents sign in to their own account to set per-investment and daily limits, pause practice, add funds, and review specific requests. The Sui practice contract enforces those boundaries, while learners use their own sign-ins and wallets.",
              ],
              [
                "Can I change my mind?",
                "Of course. Add a reflection or correct something the guide remembers. Your original reason remains part of the dated decision; later understanding has its own place.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={17} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-section">
          <Eyebrow>EVERY GREAT FUTURE STARTS SOMEWHERE.</Eyebrow>
          <h2>
            LET’S SEE WHAT
            <br />
            <span className="accent">YOU CAN GROW.</span>
          </h2>
          <Button to="/app">
            Try Trove <ArrowUpRight size={18} />
          </Button>
          <p>No real money. Just a little curiosity.</p>
        </section>
      </main>
      <footer className="site-footer">
        <Brand compact />
        <span>A LITTLE WISER. EVERY DAY.</span>
        <div>
          <Link to="/app/evidence">
            Build & integration status <ArrowUpRight size={13} />
          </Link>
          <a href="#main">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}
