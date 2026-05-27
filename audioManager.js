/*
  EMPYREAN AUDIO MANAGER
  ===============================================================

  This module owns browser Audio elements and audio state:

    - ambient chapel drone
    - combat music
    - intro-to-loop ambient transitions
    - combat fades
    - one-shot sounds
    - volume/playback-rate state
    - pause/resume behavior
    - future room ambience hooks

  It deliberately does NOT own:

    - combat state decisions
    - d20/oracle math
    - rigging or puppet workshop behavior
    - enemy AI
    - room geometry

  Other systems should ask for sound changes through this manager instead of
  directly mutating Audio objects. That keeps atmosphere as a first-class system
  without letting it make gameplay decisions.
*/

const DEFAULT_AMBIENT_TRACK = "chapelDrone";
const DEFAULT_COMBAT_TRACK = "combat";

const DEFAULT_AUDIO_LIBRARY = {
  ambient: {
    chapelDrone: {
      src: "assets/ambient.ogg",
      loop: true,
      volume: 1,
      playbackRate: 1,
    },
  },
  combat: {
    combat: {
      introSrc: "assets/combatIntro.ogg",
      loopSrc: "assets/combatLoop.ogg",
      volume: 0.8,
      fadeInSeconds: 1.4,
      fadeOutSeconds: 1.4,
    },
  },
  oneShots: {},
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneLibrary(library) {
  return JSON.parse(JSON.stringify(library || {}));
}

function makeAudioElement({
  src = "",
  loop = false,
  volume = 1,
  playbackRate = 1,
} = {}) {
  const audio = new Audio(src);
  audio.loop = Boolean(loop);
  audio.volume = clamp(volume, 0, 1);
  audio.playbackRate = clamp(playbackRate, 0.5, 4);
  audio.preload = "auto";
  return audio;
}

function playAudioElement(audio, waitingMessage) {
  if (!audio) {
    return Promise.resolve();
  }

  return audio.play().catch((error) => {
    console.info(waitingMessage, error);
  });
}

function audioSourceEndsWith(audio, src) {
  return Boolean(audio?.src && src && audio.src.endsWith(src));
}

export function createEmpyreanAudioManager(options = {}) {
  /*
    Creates the runtime audio station.

    Options keep the old SOLO_TWEAKS behavior intact:

      ambientPath = current backgroundPath
      ambientLoop = current loop flag
      autoplay    = current autoplay flag

    Combat keeps the previous battle.mp3 timing/volumes unless the caller passes
    overrides. The returned API is intentionally small and gameplay-facing.
  */
  const library = cloneLibrary(DEFAULT_AUDIO_LIBRARY);
  const chapelDrone = library.ambient.chapelDrone;
  chapelDrone.src = options.ambientPath || chapelDrone.src;
  chapelDrone.loop =
    typeof options.ambientLoop === "boolean"
      ? options.ambientLoop
      : chapelDrone.loop;
  chapelDrone.volume = Number.isFinite(options.ambientVolume)
    ? options.ambientVolume
    : chapelDrone.volume;

  const combatTrack = library.combat.combat;
  combatTrack.introSrc = options.combatIntroPath || combatTrack.introSrc;
  combatTrack.loopSrc = options.combatLoopPath || combatTrack.loopSrc;
  combatTrack.volume = Number.isFinite(options.combatVolume)
    ? options.combatVolume
    : combatTrack.volume;
  combatTrack.fadeInSeconds = Number.isFinite(options.combatFadeInSeconds)
    ? options.combatFadeInSeconds
    : combatTrack.fadeInSeconds;
  combatTrack.fadeOutSeconds = Number.isFinite(options.combatFadeOutSeconds)
    ? options.combatFadeOutSeconds
    : combatTrack.fadeOutSeconds;

  const state = {
    currentAmbientName: DEFAULT_AMBIENT_TRACK,
    currentCombatName: DEFAULT_COMBAT_TRACK,
    combatPhase: "idle",
    ambientAudio: makeAudioElement(chapelDrone),
    combatIntroAudio: makeAudioElement({
      src: combatTrack.introSrc,
      loop: false,
      volume: 0,
      playbackRate: combatTrack.playbackRate || 1,
    }),
    combatLoopAudio: makeAudioElement({
      src: combatTrack.loopSrc,
      loop: true,
      volume: 0,
      playbackRate: combatTrack.playbackRate || 1,
    }),
    fade: {
      ambientFrame: null,
      combatInElapsed: 0,
      combatOutElapsed: 0,
      combatInProgress: 0,
      combatOutProgress: 0,
      fadingOut: false,
    },
    activeEncounters: 0,
    pausedSnapshot: null,
    oneShotPool: new Set(),
  };

  function activeCombatAudio() {
    return state.combatPhase === "loop"
      ? state.combatLoopAudio
      : state.combatIntroAudio;
  }

  function getAmbientTrack(name = DEFAULT_AMBIENT_TRACK) {
    return library.ambient[name] || library.ambient[DEFAULT_AMBIENT_TRACK];
  }

  function getCombatTrack(name = DEFAULT_COMBAT_TRACK) {
    return library.combat[name] || library.combat[DEFAULT_COMBAT_TRACK];
  }

  function setAudioSource(audio, src, loop) {
    if (src && !audioSourceEndsWith(audio, src)) {
      audio.pause();
      audio.src = src;
      audio.load();
    }

    if (typeof loop === "boolean") {
      audio.loop = loop;
    }
  }

  function configureAmbientElement(track) {
    state.ambientAudio.volume = clamp(track.volume ?? state.ambientAudio.volume, 0, 1);
    state.ambientAudio.playbackRate = clamp(
      track.playbackRate ?? state.ambientAudio.playbackRate,
      0.5,
      4,
    );
  }

  function playAmbient(name = DEFAULT_AMBIENT_TRACK) {
    /*
      Plays a named ambient track.

      If a future track has introSrc + loopSrc, the manager plays the intro once
      and switches itself into the loop. Current behavior uses only ambient.ogg,
      so this does not change today's startup sound.
    */
    const track = getAmbientTrack(name);
    state.currentAmbientName = name;

    if (track.introSrc && track.loopSrc) {
      setAudioSource(state.ambientAudio, track.introSrc, false);
      configureAmbientElement(track);
      state.ambientAudio.onended = () => {
        if (state.currentAmbientName !== name) {
          return;
        }
        state.ambientAudio.onended = null;
        setAudioSource(state.ambientAudio, track.loopSrc, true);
        playAudioElement(
          state.ambientAudio,
          "Ambient loop is waiting for user interaction.",
        );
      };
    } else {
      state.ambientAudio.onended = null;
      setAudioSource(state.ambientAudio, track.src, track.loop);
      configureAmbientElement(track);
    }

    return playAudioElement(
      state.ambientAudio,
      "Background audio is waiting for user interaction.",
    );
  }

  function fadeToAmbient(name = DEFAULT_AMBIENT_TRACK, { duration = 1 } = {}) {
    /*
      Future room ambience hook.

      Current encounter zones still use direct action values for volume and
      playbackRate. This helper is ready for later named room ambience without
      changing existing behavior.
    */
    if (state.fade.ambientFrame) {
      cancelAnimationFrame(state.fade.ambientFrame);
      state.fade.ambientFrame = null;
    }

    const track = getAmbientTrack(name);
    const startVolume = state.ambientAudio.volume;
    const targetVolume = clamp(track.volume ?? 1, 0, 1);
    const fadeSeconds = Math.max(0, duration);

    if (fadeSeconds <= 0) {
      state.currentAmbientName = name;
      setAudioSource(state.ambientAudio, track.src || track.loopSrc, track.loop);
      configureAmbientElement(track);
      return playAmbient(name);
    }

    const startedAt = performance.now();
    state.currentAmbientName = name;
    setAudioSource(state.ambientAudio, track.src || track.loopSrc, track.loop);
    configureAmbientElement({
      ...track,
      volume: startVolume,
    });
    playAudioElement(
      state.ambientAudio,
      "Background audio is waiting for user interaction.",
    );

    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const progress = clamp(elapsed / fadeSeconds, 0, 1);
      state.ambientAudio.volume =
        startVolume + (targetVolume - startVolume) * progress;

      if (progress < 1) {
        state.fade.ambientFrame = requestAnimationFrame(tick);
      } else {
        state.fade.ambientFrame = null;
      }
    };

    state.fade.ambientFrame = requestAnimationFrame(tick);
    return Promise.resolve();
  }

  function applyEncounterAudioAction(action = {}) {
    /*
      Compatibility path for data-driven encounter zones.

      This preserves the old world.js behavior:
        - optional src swap
        - volume clamp
        - playbackRate clamp
        - loop flag
        - optional pause
        - optional play
    */
    if (action.src) {
      setAudioSource(state.ambientAudio, action.src, action.loop);
    }

    if (Number.isFinite(action.volume)) {
      state.ambientAudio.volume = clamp(action.volume, 0, 1);
    }

    if (Number.isFinite(action.playbackRate)) {
      state.ambientAudio.playbackRate = clamp(action.playbackRate, 0.5, 4);
    }

    if (typeof action.loop === "boolean") {
      state.ambientAudio.loop = action.loop;
    }

    if (action.pause) {
      state.ambientAudio.pause();
      return;
    }

    if (action.play) {
      playAudioElement(
        state.ambientAudio,
        "Encounter audio is waiting for user interaction.",
      );
    }
  }

  function startCombatMusic(name = DEFAULT_COMBAT_TRACK) {
    /*
      Begins the combat crossfade. The encounter still decides WHEN combat
      starts; the manager owns HOW the audio elements ramp.

      Combat is split into two audio elements: an intro that plays once, and a
      loop that takes over on the intro's `ended` event. The intro/loop pair
      replaces the old single battle.mp3 — the fade-in still ramps from ambient
      to combat, and the fade-out still ramps from whichever combat segment is
      currently active back to ambient.

      Overlapping encounters share one music timeline. activeEncounters is a
      reference count: subsequent starts while combat is already playing do NOT
      restart the intro, and stops only fade out the music when the last
      encounter is done. The leading encounter still drives the fade-in tick.
    */
    state.activeEncounters += 1;

    // Edge case: a new encounter began while the previous fade-out was still
    // running. Cancel the fade-out and snap volumes back to "in combat" levels
    // rather than restarting the intro from scratch. There is an audible volume
    // snap in this rare window — preferable to a full intro restart.
    if (state.fade.fadingOut) {
      const track = getCombatTrack(state.currentCombatName);
      state.fade.fadingOut = false;
      state.fade.combatOutElapsed = 0;
      state.fade.combatOutProgress = 0;
      activeCombatAudio().volume = track.volume || 0;
      state.ambientAudio.volume = 0;
      // Mark fade-in as complete so the caller's tickStarting (which reads
      // updateCombatMusicFadeIn's progress) doesn't try to ramp from zero.
      state.fade.combatInElapsed = Math.max(track.fadeInSeconds || 1, 1);
      state.fade.combatInProgress = 1;
      return;
    }

    // Combat is already engaged (intro or loop playing). A second/third
    // overlapping encounter must not retrigger the music.
    if (state.combatPhase !== "idle") {
      return;
    }

    // Cold start.
    const track = getCombatTrack(name);
    state.currentCombatName = name;
    state.combatPhase = "intro";
    state.fade.combatInElapsed = 0;
    state.fade.combatOutElapsed = 0;
    state.fade.combatInProgress = 0;
    state.fade.combatOutProgress = 0;
    state.fade.fadingOut = false;

    // Reset the loop element so it's ready to take over instantly.
    state.combatLoopAudio.pause();
    setAudioSource(state.combatLoopAudio, track.loopSrc, true);
    state.combatLoopAudio.currentTime = 0;
    state.combatLoopAudio.volume = 0;
    state.combatLoopAudio.playbackRate = clamp(track.playbackRate || 1, 0.5, 4);

    setAudioSource(state.combatIntroAudio, track.introSrc, false);
    state.combatIntroAudio.currentTime = 0;
    state.combatIntroAudio.volume = 0;
    state.combatIntroAudio.playbackRate = clamp(track.playbackRate || 1, 0.5, 4);
    state.combatIntroAudio.onended = handleCombatIntroEnded;

    playAudioElement(
      state.combatIntroAudio,
      "[combat] battle intro waiting for user interaction.",
    );
  }

  function handleCombatIntroEnded() {
    // The intro just finished naturally. If a fade-out is in progress, leave
    // the (now-silent) intro element alone and let the fade finish it — we do
    // NOT want the loop to roar in mid-exit.
    if (state.combatPhase !== "intro") {
      return;
    }
    if (state.fade.fadingOut) {
      return;
    }

    const handoffVolume = state.combatIntroAudio.volume;
    state.combatPhase = "loop";
    state.combatLoopAudio.currentTime = 0;
    state.combatLoopAudio.volume = handoffVolume;
    playAudioElement(
      state.combatLoopAudio,
      "[combat] battle loop waiting for user interaction.",
    );
  }

  function updateCombatMusicFadeIn(delta) {
    const track = getCombatTrack(state.currentCombatName);
    const fadeSeconds = Math.max(track.fadeInSeconds || 0.01, 0.01);
    state.fade.combatInElapsed += delta;
    const progress = clamp(state.fade.combatInElapsed / fadeSeconds, 0, 1);
    state.fade.combatInProgress = progress;

    activeCombatAudio().volume = (track.volume || 0) * progress;
    state.ambientAudio.volume = (chapelDrone.volume || 1) * (1 - progress);

    return progress;
  }

  function stopCombatMusic() {
    /*
      Starts the combat fade-out. The sound is paused/reset when
      updateCombatMusicFadeOut() reaches 1.0, matching the old encounter flow.
      The fadingOut flag also blocks the intro->loop handoff if the intro
      happens to finish during the fade.

      Refcount: only the LAST active encounter actually triggers the fade-out.
      Earlier stops just decrement the counter so the music keeps playing for
      the encounters still in progress.
    */
    if (state.activeEncounters > 0) {
      state.activeEncounters -= 1;
    }
    if (state.activeEncounters > 0) {
      return;
    }
    if (state.combatPhase === "idle") {
      return;
    }

    state.fade.combatOutElapsed = 0;
    state.fade.combatOutProgress = 0;
    state.fade.fadingOut = true;
  }

  function updateCombatMusicFadeOut(delta) {
    const track = getCombatTrack(state.currentCombatName);
    const fadeSeconds = Math.max(track.fadeOutSeconds || 0.01, 0.01);
    state.fade.combatOutElapsed += delta;
    const progress = clamp(state.fade.combatOutElapsed / fadeSeconds, 0, 1);
    const inverse = 1 - progress;
    state.fade.combatOutProgress = progress;

    activeCombatAudio().volume = (track.volume || 0) * inverse;
    state.ambientAudio.volume = (chapelDrone.volume || 1) * progress;

    if (progress >= 1) {
      state.combatIntroAudio.pause();
      state.combatIntroAudio.currentTime = 0;
      state.combatIntroAudio.volume = 0;
      state.combatLoopAudio.pause();
      state.combatLoopAudio.currentTime = 0;
      state.combatLoopAudio.volume = 0;
      state.combatPhase = "idle";
      state.fade.fadingOut = false;
      state.activeEncounters = 0;
    }

    return progress;
  }

  function getCombatFadeInProgress() {
    return state.fade.combatInProgress;
  }

  function getCombatFadeOutProgress() {
    return state.fade.combatOutProgress;
  }

  function playOneShot(name, options = {}) {
    /*
      Plays a short sound without disturbing ambient or combat tracks.

      Callers can use a named library entry later, or pass { src } now.
    */
    const sound = library.oneShots[name] || options;
    if (!sound?.src) {
      console.warn("[audio] unknown one-shot", name);
      return null;
    }

    const audio = makeAudioElement({
      src: sound.src,
      loop: false,
      volume: Number.isFinite(sound.volume) ? sound.volume : 1,
      playbackRate: Number.isFinite(sound.playbackRate)
        ? sound.playbackRate
        : 1,
    });
    state.oneShotPool.add(audio);
    audio.onended = () => state.oneShotPool.delete(audio);
    playAudioElement(audio, "[audio] one-shot waiting for user interaction.");
    return audio;
  }

  function pauseAllAudio() {
    state.pausedSnapshot = {
      ambientWasPlaying: !state.ambientAudio.paused,
      combatIntroWasPlaying: !state.combatIntroAudio.paused,
      combatLoopWasPlaying: !state.combatLoopAudio.paused,
      oneShots: [...state.oneShotPool].filter((audio) => !audio.paused),
    };

    state.ambientAudio.pause();
    state.combatIntroAudio.pause();
    state.combatLoopAudio.pause();
    state.oneShotPool.forEach((audio) => audio.pause());
  }

  function resumeAllAudio() {
    const snapshot = state.pausedSnapshot;
    if (!snapshot) {
      return;
    }

    if (snapshot.ambientWasPlaying) {
      playAudioElement(
        state.ambientAudio,
        "Background audio is waiting for user interaction.",
      );
    }

    if (snapshot.combatIntroWasPlaying) {
      playAudioElement(
        state.combatIntroAudio,
        "[combat] battle intro waiting for user interaction.",
      );
    }

    if (snapshot.combatLoopWasPlaying) {
      playAudioElement(
        state.combatLoopAudio,
        "[combat] battle loop waiting for user interaction.",
      );
    }

    snapshot.oneShots.forEach((audio) => {
      if (state.oneShotPool.has(audio)) {
        playAudioElement(audio, "[audio] one-shot waiting for user interaction.");
      }
    });

    state.pausedSnapshot = null;
  }

  const api = {
    playAmbient,
    fadeToAmbient,
    startCombatMusic,
    stopCombatMusic,
    updateCombatMusicFadeIn,
    updateCombatMusicFadeOut,
    getCombatFadeInProgress,
    getCombatFadeOutProgress,
    playOneShot,
    pauseAllAudio,
    resumeAllAudio,
    applyEncounterAudioAction,
  };

  if (options.autoplay) {
    playAmbient(DEFAULT_AMBIENT_TRACK);
  }

  return api;
}
