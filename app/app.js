(function () {
  "use strict";

  const D = window.SYNC_DATA;
  const { Clock, BeatAudio } = window.SyncEngine;

  const els = {
    canvas: document.getElementById("screen"),
    timeReadout: document.getElementById("timeReadout"),
    playBtn: document.getElementById("playBtn"),
    scrubber: document.getElementById("scrubber"),
    transportTime: document.getElementById("transportTime"),
    offsetSlider: document.getElementById("offsetSlider"),
    offsetValue: document.getElementById("offsetValue"),
    toleranceInput: document.getElementById("toleranceInput"),
    saveBtn: document.getElementById("saveBtn"),
    saveStatus: document.getElementById("saveStatus"),
    tableBody: document.getElementById("tableBody"),
    avgDiff: document.getElementById("avgDiff")
  };

  const clock = new Clock(D.durationSec);
  let audioOffsetSec = 0;
  let toleranceMs = D.defaultToleranceMs;

  const audio = new BeatAudio(clock, D.beatTimesSec, () => audioOffsetSec);

  const fmt3 = (n) => n.toFixed(3);

  function buildTable() {
    els.tableBody.innerHTML = "";
    D.flashTimesSec.forEach((flashSec, i) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(i);
      tr.innerHTML =
        "<td class='col-index'></td>" +
        "<td class='col-flash'></td>" +
        "<td class='col-beat'></td>" +
        "<td class='col-diff'></td>";
      els.tableBody.appendChild(tr);
    });
  }

  function rowData() {
    return D.flashTimesSec.map((flashSec, i) => {
      const correctedBeatSec = D.beatTimesSec[i] + audioOffsetSec;
      let diffMs = (correctedBeatSec - flashSec) * 1000;
      if (Math.abs(diffMs) < 1e-9) diffMs = 0;
      return { flashSec, correctedBeatSec, diffMs };
    });
  }

  function renderTable() {
    const rows = rowData();
    let sum = 0;
    rows.forEach((r, i) => {
      const tr = els.tableBody.children[i];
      tr.querySelector(".col-index").textContent = String(i + 1);
      tr.querySelector(".col-flash").textContent = fmt3(r.flashSec);
      tr.querySelector(".col-beat").textContent = fmt3(r.correctedBeatSec);
      tr.querySelector(".col-diff").textContent = r.diffMs.toFixed(1);
      tr.classList.toggle("over-tolerance", Math.abs(r.diffMs) > toleranceMs);
      sum += r.diffMs;
    });
    const avg = sum / rows.length;
    els.avgDiff.textContent = avg.toFixed(1) + " ms";
    els.avgDiff.classList.toggle("over-tolerance", Math.abs(avg) > toleranceMs);
  }

  const ctx2d = els.canvas.getContext("2d");

  function eventActive(timeSec, eventSec) {
    return Math.abs(timeSec - eventSec) <= 0.09;
  }

  function renderScreen(timeSec) {
    const w = els.canvas.width;
    const h = els.canvas.height;
    const flashOn = D.flashTimesSec.some((f) => eventActive(timeSec, f));
    const beatOn = D.beatTimesSec.some((b) =>
      eventActive(timeSec, b + audioOffsetSec)
    );

    ctx2d.fillStyle = flashOn ? "#f5f5f5" : "#0d0d0d";
    ctx2d.fillRect(0, 0, w, h);

    ctx2d.fillStyle = flashOn ? "#111" : "#3a3a3a";
    ctx2d.beginPath();
    ctx2d.arc(24, 24, 9, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.fillStyle = beatOn ? "#2f7dff" : "#262626";
    ctx2d.beginPath();
    ctx2d.arc(48, 24, 9, 0, Math.PI * 2);
    ctx2d.fill();

    if (beatOn) {
      ctx2d.strokeStyle = "#2f7dff";
      ctx2d.lineWidth = 4;
      ctx2d.beginPath();
      ctx2d.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
      ctx2d.stroke();
    }

    els.timeReadout.textContent = "t = " + fmt3(timeSec) + " s";
    els.timeReadout.style.color = flashOn ? "#111" : "#f2f2f2";
  }

  function renderTransport(timeSec) {
    els.scrubber.value = String(timeSec);
    els.transportTime.textContent =
      fmt3(timeSec) + " / " + fmt3(D.durationSec) + " s";
    els.playBtn.textContent = clock.playing ? "暂停" : "播放";
  }

  function frame() {
    const t = clock.currentTime();
    renderScreen(t);
    renderTransport(t);
    if (clock.playing) requestAnimationFrame(frame);
  }

  clock.onChange(() => {
    if (clock.playing) requestAnimationFrame(frame);
    renderTransport(clock.currentTime());
    renderScreen(clock.currentTime());
  });

  function saveOffset() {
    const ms = Math.round(audioOffsetSec * 1000);
    localStorage.setItem(D.storageKey, String(ms));
    els.saveStatus.textContent = "已载入保存的偏移 " + ms + " ms";
  }

  function loadOffset() {
    const raw = localStorage.getItem(D.storageKey);
    if (raw === null) return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms)) return null;
    audioOffsetSec = ms / 1000;
    els.offsetSlider.value = String(ms);
    els.offsetValue.textContent = ms + " ms";
    els.saveStatus.textContent = "已载入保存的偏移 " + ms + " ms";
    renderTable();
    return ms;
  }

  els.playBtn.addEventListener("click", () => clock.toggle());

  els.scrubber.addEventListener("input", (e) => {
    clock.seek(Number(e.target.value));
  });

  els.offsetSlider.addEventListener("input", (e) => {
    const ms = Number(e.target.value);
    audioOffsetSec = ms / 1000;
    els.offsetValue.textContent = ms + " ms";
    renderTable();
    renderScreen(clock.currentTime());
  });

  els.toleranceInput.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v > 0) {
      toleranceMs = v;
      renderTable();
    }
  });

  els.saveBtn.addEventListener("click", saveOffset);

  buildTable();
  renderTable();
  loadOffset();
  renderTransport(clock.currentTime());
  renderScreen(clock.currentTime());

  window.SyncApp = {
    clock,
    saveOffset,
    loadOffset,
    rowData,
    get offsetSec() {
      return audioOffsetSec;
    },
    get toleranceMs() {
      return toleranceMs;
    }
  };
})();
