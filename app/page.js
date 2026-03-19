"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

const LEVELS = [
  { level: "A1", display: "A1 - Beginner" },
  { level: "A2", display: "A2 - Elementary" },
  { level: "B1", display: "B1 - Intermediate" },
  { level: "B2", display: "B2 - Upper-Intermediate" },
  { level: "C1", display: "C1 - Advanced" },
  { level: "C2", display: "C2 - Proficient" },
];

const INITIAL_RESULT = {
  summary: "",
  keyTakeaways: [],
  practiceQuestions: [],
};

function slugifyQuizId(value) {
  const normalized = String(value ?? "").trim();

  return (
    normalized
    .replace(/^practice\s+for\s+/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase() || "item"
  );
}

function buildGeminiPayload(transcript, selectedLevel) {
  const systemPrompt =
    "You are an expert English as a Second Language tutor. A student has provided a podcast transcript. Return a single valid JSON object that matches the requested schema exactly.";

  const userPrompt = `Here is the transcript:\n\n${transcript}`;

  return {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          summary: {
            type: "STRING",
            description:
              "A concise, one-paragraph summary of the transcript as plain text.",
          },
          keyTakeaways: {
            type: "ARRAY",
            description: `A list of useful idioms, phrasal verbs, and lifestyle vocabulary for a CEFR ${selectedLevel} learner. Return at most 50 items.`,
            items: {
              type: "OBJECT",
              properties: {
                phrase: {
                  type: "STRING",
                  description: "The key word or phrase.",
                },
                definition: {
                  type: "STRING",
                  description: "A clear and simple definition of the phrase.",
                },
                example: {
                  type: "STRING",
                  description: "An example sentence using the phrase.",
                },
              },
              propertyOrdering: ["phrase", "definition", "example"],
            },
          },
          practiceQuestions: {
            type: "ARRAY",
            description:
              "An array of quiz groups. Create up to 3 multiple-choice questions for each takeaway phrase.",
            items: {
              type: "OBJECT",
              properties: {
                takeaway: {
                  type: "STRING",
                  description:
                    "A string formatted as: Practice for [The Takeaway Phrase]",
                },
                questions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      questionText: { type: "STRING" },
                      options: {
                        type: "ARRAY",
                        items: { type: "STRING" },
                      },
                      correctAnswer: { type: "STRING" },
                    },
                    propertyOrdering: [
                      "questionText",
                      "options",
                      "correctAnswer",
                    ],
                  },
                },
              },
              propertyOrdering: ["takeaway", "questions"],
            },
          },
        },
        propertyOrdering: ["summary", "keyTakeaways", "practiceQuestions"],
      },
    },
  };
}

function parseStructuredResult(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    const cleaned = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");
    return JSON.parse(cleaned);
  }

  return JSON.parse(trimmed);
}

export default function Page() {
  const [inputMode, setInputMode] = useState("text");
  const [transcript, setTranscript] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("B1");
  const [activeTab, setActiveTab] = useState("summary");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(INITIAL_RESULT);
  const [hasResult, setHasResult] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");
  const [speakingSection, setSpeakingSection] = useState("");
  const [speechPaused, setSpeechPaused] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const [highlightedQuizId, setHighlightedQuizId] = useState("");

  const utteranceRef = useRef(null);
  const highlightTimeoutRef = useRef(null);

  const totalQuestions = result.practiceQuestions.reduce(
    (total, group) => total + (group.questions?.length ?? 0),
    0,
  );

  const currentScore = Object.values(answeredQuestions).filter(
    (entry) => entry.isCorrect,
  ).length;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return undefined;
    }

    const speech = window.speechSynthesis;

    const updateVoices = () => {
      const availableVoices = speech.getVoices();
      const englishVoices = availableVoices.filter((voice) =>
        voice.lang.startsWith("en-"),
      );
      const nextVoices =
        englishVoices.length > 0 ? englishVoices : availableVoices;

      setVoices(nextVoices);
      setSelectedVoiceName((current) => {
        if (current && nextVoices.some((voice) => voice.name === current)) {
          return current;
        }
        return nextVoices[0]?.name ?? "";
      });
    };

    updateVoices();
    speech.onvoiceschanged = updateVoices;

    return () => {
      speech.cancel();
      speech.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  function stopSpeech() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    utteranceRef.current = null;
    setSpeakingSection("");
    setSpeechPaused(false);
  }

  function handleSpeech(section, text) {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      !text.trim()
    ) {
      return;
    }

    const speech = window.speechSynthesis;

    if (speakingSection === section && speech.speaking && !speech.paused) {
      speech.pause();
      setSpeechPaused(true);
      return;
    }

    if (speakingSection === section && speech.paused) {
      speech.resume();
      setSpeechPaused(false);
      return;
    }

    speech.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find((voice) => voice.name === selectedVoiceName);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      utteranceRef.current = null;
      setSpeakingSection("");
      setSpeechPaused(false);
    };

    utterance.onerror = () => {
      utteranceRef.current = null;
      setSpeakingSection("");
      setSpeechPaused(false);
    };

    utterance.onpause = () => {
      setSpeechPaused(true);
    };

    utterance.onresume = () => {
      setSpeechPaused(false);
    };

    utteranceRef.current = utterance;
    setSpeakingSection(section);
    setSpeechPaused(false);
    speech.speak(utterance);
  }

  function switchTab(tab) {
    stopSpeech();
    setActiveTab(tab);
  }

  async function callGeminiApi(nextTranscript) {
    const payload = buildGeminiPayload(nextTranscript, selectedLevel);
    let delay = 1000;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Request failed with ${response.status}`);
        }

        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
          throw new Error("Gemini returned an empty response.");
        }

        return parseStructuredResult(text);
      } catch (requestError) {
        if (attempt === 2) {
          throw requestError;
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, delay);
        });
        delay *= 2;
      }
    }

    throw new Error("Gemini request failed.");
  }

  async function handleSubmit() {
    if (!transcript.trim()) {
      setError("Please paste a transcript first.");
      setHasResult(true);
      setResult(INITIAL_RESULT);
      return;
    }

    setIsLoading(true);
    setError("");
    setHasResult(true);
    setAnsweredQuestions({});
    setExpandedGroups({});
    setHighlightedQuizId("");
    stopSpeech();

    try {
      const structuredResult = await callGeminiApi(transcript.trim());
      setResult({
        summary: structuredResult.summary ?? "",
        keyTakeaways: structuredResult.keyTakeaways ?? [],
        practiceQuestions: structuredResult.practiceQuestions ?? [],
      });
      setActiveTab("summary");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "An error occurred while analyzing the transcript.",
      );
      setResult(INITIAL_RESULT);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAnswer(questionKey, selectedOption, correctAnswer) {
    if (answeredQuestions[questionKey]) {
      return;
    }

    setAnsweredQuestions((current) => ({
      ...current,
      [questionKey]: {
        selectedOption,
        correctAnswer,
        isCorrect: selectedOption === correctAnswer,
      },
    }));
  }

  function jumpToQuiz(phrase) {
    const quizId = `quiz-${slugifyQuizId(phrase)}`;
    const nextExpandedGroups = result.practiceQuestions.reduce((all, group) => {
      const groupId = `quiz-${slugifyQuizId(group.takeaway)}`;
      return {
        ...all,
        [groupId]: groupId === quizId,
      };
    }, {});

    switchTab("questions");
    setExpandedGroups(nextExpandedGroups);
    setHighlightedQuizId(quizId);

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    window.setTimeout(() => {
      document.getElementById(quizId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedQuizId("");
    }, 1400);
  }

  const selectedLevelDisplay =
    LEVELS.find((level) => level.level === selectedLevel)?.display ??
    "B1 - Intermediate";

  const summaryButtonLabel =
    speakingSection === "summary" ? (speechPaused ? "Resume" : "Pause") : "Listen";

  const takeawaysButtonLabel =
    speakingSection === "takeaways"
      ? speechPaused
        ? "Resume"
        : "Pause"
      : "Listen";

  const takeawaysNarration = result.keyTakeaways
    .map((item) => `${item.phrase}. ${item.definition}. Example: ${item.example}`)
    .join(" ");

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {isLoading ? (
          <div className={styles.overlay}>
            <div className={styles.overlayCard}>
              <div className={styles.overlaySpinner} />
              <div>AI is generating your lesson...</div>
              <div className={styles.muted}>This can take a moment.</div>
            </div>
          </div>
        ) : null}

        <header className={styles.header}>
          <p className={styles.eyebrow}>Transcript To Lesson</p>
          <h1 className={styles.title}>English Podcast Learner</h1>
          <p className={styles.subtitle}>
            Paste a short English podcast transcript and get a summary,
            vocabulary takeaways, and quiz questions tailored to your CEFR
            level.
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeButton} ${inputMode === "text" ? styles.modeButtonActive : ""}`}
              onClick={() => setInputMode("text")}
              type="button"
            >
              Paste Text
            </button>
            <button
              className={`${styles.modeButton} ${inputMode === "link" ? styles.modeButtonActive : ""} ${styles.modeButtonDisabled}`}
              onClick={() => setInputMode("link")}
              type="button"
            >
              Podcast Link
            </button>
          </div>

          {inputMode === "text" ? (
            <textarea
              className={styles.textArea}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Paste your podcast transcript here. Shorter transcripts work best."
              value={transcript}
            />
          ) : (
            <div className={styles.soonCard}>
              <strong>Feature coming soon.</strong> Direct podcast-link
              processing needs a separate ingestion pipeline. The Next.js
              migration keeps the UI deployable on Vercel and preserves the
              existing transcript workflow.
            </div>
          )}

          <div className={styles.levelBlock}>
            <p className={styles.sectionLabel}>Select Your English CEFR Level</p>
            <div className={styles.levelGrid}>
              {LEVELS.map((level) => (
                <button
                  className={`${styles.levelButton} ${selectedLevel === level.level ? styles.levelButtonActive : ""}`}
                  disabled={isLoading}
                  key={level.level}
                  onClick={() => setSelectedLevel(level.level)}
                  type="button"
                >
                  {level.level}
                </button>
              ))}
            </div>
            <p className={styles.levelDescription}>
              The analysis will be tailored for a {selectedLevelDisplay} learner.
            </p>
          </div>

          <button
            className={styles.processButton}
            disabled={isLoading || inputMode !== "text"}
            onClick={handleSubmit}
            type="button"
          >
            {isLoading ? <span className={styles.spinner} /> : "Analyze Transcript"}
          </button>
        </section>

        {hasResult ? (
          <section className={styles.results}>
            {error ? <div className={styles.error}>{error}</div> : null}

            {!error && !isLoading ? (
              <>
                <div className={styles.voiceRow}>
                  <label className={styles.sectionLabel} htmlFor="voice-select">
                    Choose a Voice
                  </label>
                  <select
                    className={styles.voiceSelect}
                    id="voice-select"
                    onChange={(event) => setSelectedVoiceName(event.target.value)}
                    value={selectedVoiceName}
                  >
                    {voices.map((voice) => (
                      <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                        {voice.name} ({voice.lang})
                        {voice.localService ? " [Local]" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.tabs}>
                  {[
                    { id: "summary", label: "Summary" },
                    { id: "takeaways", label: "Key Takeaways" },
                    { id: "questions", label: "Quiz" },
                  ].map((tab) => (
                    <button
                      className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ""}`}
                      key={tab.id}
                      onClick={() => switchTab(tab.id)}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className={styles.panel}>
                  {activeTab === "summary" ? (
                    <>
                      <p className={styles.summary}>
                        {result.summary || "No summary was generated."}
                      </p>
                      <button
                        className={`${styles.audioButton} ${speakingSection === "summary" && !speechPaused ? styles.audioButtonPlaying : ""}`}
                        onClick={() => handleSpeech("summary", result.summary)}
                        type="button"
                      >
                        {summaryButtonLabel}
                      </button>
                    </>
                  ) : null}

                  {activeTab === "takeaways" ? (
                    <>
                      <button
                        className={`${styles.audioButton} ${speakingSection === "takeaways" && !speechPaused ? styles.audioButtonPlaying : ""}`}
                        onClick={() => handleSpeech("takeaways", takeawaysNarration)}
                        type="button"
                      >
                        {takeawaysButtonLabel}
                      </button>

                      {result.keyTakeaways.length > 0 ? (
                        <div className={styles.takeawayList}>
                          {result.keyTakeaways.map((item) => (
                            <article
                              className={styles.takeawayCard}
                              key={`${item.phrase}-${item.example}`}
                            >
                              <button
                                className={styles.takeawayLink}
                                onClick={() => jumpToQuiz(item.phrase)}
                                type="button"
                              >
                                {item.phrase}
                              </button>
                              <p className={styles.takeawayText}>
                                {item.definition}
                              </p>
                              <p className={styles.takeawayExample}>
                                Example: {item.example}
                              </p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          No key takeaways were generated for this transcript.
                        </p>
                      )}
                    </>
                  ) : null}

                  {activeTab === "questions" ? (
                    <>
                      <div className={styles.scoreboard}>
                        <span>Quiz Progress</span>
                        <span>
                          {currentScore} / {totalQuestions}
                        </span>
                      </div>

                      {result.practiceQuestions.length > 0 ? (
                        <div className={styles.quizList}>
                          {result.practiceQuestions.map((group) => {
                            const groupId = `quiz-${slugifyQuizId(group.takeaway)}`;
                            const isExpanded = Boolean(expandedGroups[groupId]);
                            const isHighlighted = highlightedQuizId === groupId;

                            return (
                              <section
                                className={`${styles.quizGroup} ${isHighlighted ? styles.quizGroupHighlighted : ""}`}
                                id={groupId}
                                key={groupId}
                              >
                                <button
                                  className={styles.quizToggle}
                                  onClick={() =>
                                    setExpandedGroups((current) => ({
                                      ...current,
                                      [groupId]: !current[groupId],
                                    }))
                                  }
                                  type="button"
                                >
                                  <h3 className={styles.quizTitle}>{group.takeaway}</h3>
                                  <span
                                    className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}
                                  >
                                    ▾
                                  </span>
                                </button>

                                {isExpanded ? (
                                  <div className={styles.quizBody}>
                                    {group.questions?.map((question, questionIndex) => {
                                      const questionKey = `${groupId}-${questionIndex}`;
                                      const answer = answeredQuestions[questionKey];

                                      return (
                                        <article
                                          className={styles.question}
                                          key={questionKey}
                                        >
                                          <p className={styles.questionText}>
                                            <strong>Question {questionIndex + 1}:</strong>{" "}
                                            {question.questionText}
                                          </p>

                                          <div className={styles.optionList}>
                                            {question.options?.map((option) => {
                                              const isCorrectOption =
                                                answer?.correctAnswer === option;
                                              const isSelectedOption =
                                                answer?.selectedOption === option;

                                              let optionClassName = styles.optionButton;

                                              if (answer?.isCorrect && isSelectedOption) {
                                                optionClassName = `${styles.optionButton} ${styles.optionCorrect}`;
                                              } else if (
                                                answer &&
                                                !answer.isCorrect &&
                                                isSelectedOption
                                              ) {
                                                optionClassName = `${styles.optionButton} ${styles.optionIncorrect}`;
                                              } else if (answer && isCorrectOption) {
                                                optionClassName = `${styles.optionButton} ${styles.optionCorrect}`;
                                              }

                                              return (
                                                <button
                                                  className={optionClassName}
                                                  disabled={Boolean(answer)}
                                                  key={option}
                                                  onClick={() =>
                                                    handleAnswer(
                                                      questionKey,
                                                      option,
                                                      question.correctAnswer,
                                                    )
                                                  }
                                                  type="button"
                                                >
                                                  {option}
                                                </button>
                                              );
                                            })}
                                          </div>

                                          {answer ? (
                                            <p
                                              className={`${styles.feedback} ${answer.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect}`}
                                            >
                                              {answer.isCorrect
                                                ? "Correct! Well done."
                                                : `Not quite. The correct answer is: ${answer.correctAnswer}`}
                                            </p>
                                          ) : null}
                                        </article>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </section>
                            );
                          })}
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          No practice questions were generated for this
                          transcript.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
