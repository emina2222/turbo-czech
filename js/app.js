/* ============================================================
   Turbo Czech — shared app engine
   No backend: everything runs client-side, progress in localStorage.
   ============================================================ */

const TC = (function () {
  const STORAGE_KEY = "tc_progress_v1";

  // ---------------- Progress storage ----------------

  function getProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { lessons: {}, daysVisited: [] };
    } catch (e) {
      return { lessons: {}, daysVisited: [] };
    }
  }

  function saveProgress(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function todayStr() {
    // Local date, not UTC — otherwise a late-evening visit in Czechia counts as the next day.
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function trackVisit() {
    const data = getProgress();
    const today = todayStr();
    if (!data.daysVisited.includes(today)) {
      data.daysVisited.push(today);
      saveProgress(data);
    }
    return data;
  }

  function markLessonComplete(lessonId, score, total) {
    const data = getProgress();
    data.lessons[lessonId] = {
      completed: true,
      score: score,
      total: total,
      date: todayStr(),
    };
    saveProgress(data);
    return data;
  }

  function isLessonComplete(lessonId) {
    const data = getProgress();
    return !!(data.lessons[lessonId] && data.lessons[lessonId].completed);
  }

  function countCompleted(totalLessons) {
    const data = getProgress();
    let n = 0;
    for (let i = 1; i <= totalLessons; i++) {
      const id = "lesson" + String(i).padStart(2, "0");
      if (data.lessons[id] && data.lessons[id].completed) n++;
    }
    return n;
  }

  // ---------------- Nav ----------------

  function initNav() {
    trackVisit();
    const links = document.querySelectorAll(".tc-nav-links a[data-nav]");
    const current = document.body.getAttribute("data-page") || "";
    links.forEach((a) => {
      if (a.getAttribute("data-nav") === current) a.classList.add("active");
    });
    const chip = document.querySelector(".tc-progress-chip");
    if (chip) {
      const total = parseInt(chip.getAttribute("data-total-lessons") || "10", 10);
      const done = countCompleted(total);
      chip.textContent = "🔥 " + done + " / " + total + " lekcija";
    }
  }

  // ---------------- Text-to-speech ----------------

  let voicesCache = null;

  function pickCzechVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    voicesCache = voices;
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("cs")) ||
      null
    );
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const czVoice = pickCzechVoice();
    if (!czVoice) showMissingVoiceNotice();
    if (czVoice) {
      utter.voice = czVoice;
      utter.lang = czVoice.lang;
    } else {
      utter.lang = "cs-CZ";
    }
    utter.rate = opts.rate || 0.85;
    utter.pitch = opts.pitch || 1;
    if (opts.button) {
      utter.onstart = () => opts.button.classList.add("playing");
      utter.onend = () => opts.button.classList.remove("playing");
      utter.onerror = () => opts.button.classList.remove("playing");
    }
    window.speechSynthesis.speak(utter);
  }

  // Without an installed Czech voice the browser reads Czech with a foreign accent — tell the learner once.
  let voiceNoticeShown = false;

  function showMissingVoiceNotice() {
    if (voiceNoticeShown) return;
    voiceNoticeShown = true;
    const container = document.querySelector(".container");
    if (!container) return;
    const note = document.createElement("div");
    note.className = "callout tip";
    note.innerHTML =
      "<h4>🔇 Češki glas nije instaliran</h4>" +
      "<p>Vaš pregledač nema češki glas, pa izgovor možda neće biti tačan. Dodajte češki jezik " +
      "(Čeština) u podešavanjima jezika i govora vašeg sistema, ili probajte drugi pregledač " +
      "(npr. Chrome ili Edge).</p>";
    container.prepend(note);
  }

  function wireSpeakButtons(root) {
    root = root || document;
    root.querySelectorAll("[data-speak]").forEach((btn) => {
      // Icon-only buttons: give screen readers something to announce.
      if (!btn.hasAttribute("aria-label")) {
        btn.setAttribute("aria-label", "Poslušaj izgovor: " + btn.getAttribute("data-speak"));
      }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        speak(btn.getAttribute("data-speak"), { button: btn });
      });
    });
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => pickCzechVoice();
  }

  // ---------------- Fill-in-the-blank checking ----------------

  function normalize(str) {
    return str
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""); // strip diacritics for lenient compare
  }

  function checkBlank(input) {
    const answers = (input.getAttribute("data-answer") || "")
      .split("|")
      .map((s) => s.trim());
    const val = input.value.trim();
    const exact = answers.some((a) => a.toLowerCase() === val.toLowerCase());
    const lenient = answers.some((a) => normalize(a) === normalize(val));
    const wrapper = input.parentElement;
    let icon = wrapper.querySelector(".feedback-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "feedback-icon";
      wrapper.appendChild(icon);
    }
    input.classList.remove("correct", "incorrect");
    if (exact) {
      input.classList.add("correct");
      icon.textContent = "✓";
      icon.className = "feedback-icon correct";
    } else if (lenient) {
      input.classList.add("correct");
      icon.textContent = "✓ (pazite na dijakritike: " + answers[0] + ")";
      icon.className = "feedback-icon correct";
    } else {
      input.classList.add("incorrect");
      icon.textContent = "✗ tačan odgovor: " + answers[0];
      icon.className = "feedback-icon incorrect";
    }
    return exact || lenient;
  }

  function wireBlankChecks(root) {
    root = root || document;
    const btn = root.querySelector("[data-check-blanks]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const inputs = root.querySelectorAll("input.blank-input");
      inputs.forEach(checkBlank);
    });
  }

  // ---------------- Practice choice (self-check listening/vocab items) ----------------
  // Markup: <div class="practice-choice"> containing .quiz-option elements each with
  // data-correct="true|false". Clicking any option reveals correctness for the group.

  function wirePracticeChoices(root) {
    root = root || document;
    root.querySelectorAll(".practice-choice").forEach((group) => {
      const options = group.querySelectorAll(".quiz-option");
      options.forEach((opt) => {
        opt.addEventListener("click", () => {
          options.forEach((o) => {
            o.classList.remove("correct-answer", "wrong-answer");
            if (o.getAttribute("data-correct") === "true") o.classList.add("correct-answer");
          });
          if (opt.getAttribute("data-correct") !== "true") opt.classList.add("wrong-answer");
        });
      });
    });
  }

  // ---------------- Flashcards ----------------

  function initFlashcards(root) {
    root = root || document;
    root.querySelectorAll(".flashcard").forEach((card) => {
      card.addEventListener("click", () => card.classList.toggle("flipped"));
    });
  }

  // ---------------- Quiz engine ----------------
  // Expects markup:
  // <form class="quiz" data-lesson-id="lesson01" data-pass-pct="60">
  //   <div class="quiz-question" data-correct="b">
  //     <div class="q-text">...</div>
  //     <label class="quiz-option"><input type="radio" name="q1" value="a">...</label>
  //     <label class="quiz-option"><input type="radio" name="q1" value="b">...</label>
  //   </div>
  //   ...
  //   <button type="submit" class="btn">Check my answers</button>
  // </form>
  // <div class="quiz-result"></div>

  function initQuiz(form) {
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const questions = form.querySelectorAll(".quiz-question");
      let correct = 0;
      questions.forEach((q, idx) => {
        const name = "q" + idx;
        const correctVal = q.getAttribute("data-correct");
        const options = q.querySelectorAll(".quiz-option");
        const selected = q.querySelector('input[name="' + name + '"]:checked');
        options.forEach((opt) => {
          opt.classList.remove("correct-answer", "wrong-answer");
          const input = opt.querySelector("input");
          if (input.value === correctVal) opt.classList.add("correct-answer");
        });
        if (selected && selected.value === correctVal) {
          correct++;
        } else if (selected) {
          selected.closest(".quiz-option").classList.add("wrong-answer");
        }
      });
      const total = questions.length;
      const pct = total ? Math.round((correct / total) * 100) : 0;
      const passPct = parseInt(form.getAttribute("data-pass-pct") || "60", 10);
      const resultEl = document.querySelector(
        form.getAttribute("data-result-target") || ".quiz-result"
      );
      if (resultEl) {
        resultEl.classList.add("show");
        resultEl.classList.toggle("pass", pct >= passPct);
        resultEl.classList.toggle("fail", pct < passPct);
        resultEl.innerHTML =
          '<div class="score">' +
          correct +
          " / " +
          total +
          "</div><div>" +
          (pct >= passPct
            ? (form.getAttribute("data-lesson-id")
                ? "Odlično! Položili ste kviz iz ove lekcije."
                : "Odlično! Dobro ste razumeli tekst.")
            : (form.getAttribute("data-lesson-id")
                ? "Nije baš tačno — pregledajte lekciju iznad i pokušajte ponovo."
                : "Nije baš tačno — pročitajte tekst ponovo i pokušajte još jednom.")) +
          "</div>";
        resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const lessonId = form.getAttribute("data-lesson-id");
      if (lessonId && pct >= passPct) {
        markLessonComplete(lessonId, correct, total);
        const completeBtn = document.querySelector("[data-mark-complete]");
        if (completeBtn) {
          completeBtn.textContent = "✓ Lekcija završena — " + correct + "/" + total;
          completeBtn.classList.add("done");
        }
      }
    });
  }

  function autoInitQuizzes(root) {
    root = root || document;
    root.querySelectorAll("form.quiz").forEach(initQuiz);
  }

  // ---------------- Boot ----------------

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    // Pages are lang="sr"; mark Czech text so screen readers and hyphenation use Czech rules.
    document.querySelectorAll(".cz").forEach((el) => el.setAttribute("lang", "cs"));
    wireSpeakButtons();
    wireBlankChecks();
    initFlashcards();
    wirePracticeChoices();
    autoInitQuizzes();
  });

  return {
    speak,
    getProgress,
    markLessonComplete,
    isLessonComplete,
    countCompleted,
    checkBlank,
    initQuiz,
  };
})();
