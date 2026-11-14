(function () {
  "use strict";

  const EDIT_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5Z"/></svg>';
  const DELETE_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5M6.5 7v4M9.5 7v4"/></svg>';

  const EXERCISES_KEY = "muscleLog.exercises";
  const EXERCISES_PATH = "data/exercises.json";
  const RECORDS_KEY = "muscleLog.records";
  const RECORDS_PATH = "data/records.json";
  const CATEGORIES_KEY = "muscleLog.exerciseCategories";
  const CATEGORIES_PATH = "data/exercise-categories.json";
  const SEED_EXERCISES = ["アームカール", "シーテッドロー", "ショルダープレス", "スクワット", "スミスアームカール", "スミスサポーテッドロー", "スミススクワット", "スミスベンチプレス", "スミスベントオーバーロー", "スミスミリタリー", "ダンベルベンチ", "チェストプレス", "デッドリフト", "ペクトラルフライ", "ベンチプレス", "ベントオーバーロー", "ミリタリープレス", "ラットプルダウン", "レッグプレス", "懸垂", "ジャンプ", "バイク", "ラン"];

  let exercises = loadExercises().sort(MuscleSync.compareExerciseNames);
  let records = loadRecords();
  let categories = loadCategories();
  let exercisesSha = null;
  let recordsSha = null;
  let categoriesSha = null;

  const form = document.getElementById("exercise-form");
  const nameInput = document.getElementById("new-exercise-name");
  const categorySelect = document.getElementById("new-exercise-category");
  const categoryAutoHint = document.getElementById("category-auto-hint");
  const listEl = document.getElementById("exercise-list");
  const countEl = document.getElementById("exercise-count");
  const emptyEl = document.getElementById("exercise-empty");
  const syncStatus = document.getElementById("sync-status");
  let categoryManuallySet = false;

  MuscleSync.initThemeToggle(document.getElementById("theme-toggle"));

  render();

  nameInput.addEventListener("input", updateCategoryAuto);
  categorySelect.addEventListener("change", function () {
    categoryManuallySet = true;
    categoryAutoHint.hidden = true;
  });

  // 種目名の入力に合わせて、ユーザーがまだ手動で部位を選んでいない間だけ
  // 自動推測した部位をセレクトに反映する(一度手動で選んだら上書きしない)。
  function updateCategoryAuto() {
    if (categoryManuallySet) return;
    const name = nameInput.value.trim();
    const found = name ? MuscleSync.muscleGroupForExercise(name) : null;
    categorySelect.value = found ? found.key : "other";
    categoryAutoHint.hidden = !name;
  }

  if (MuscleSync.getToken()) {
    syncFromGithub();
    syncCategoriesFromGithub();
  } else {
    setSyncStatus("GitHub同期: 無効（記録画面でトークンを登録すると同期されます）");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    if (exercises.includes(name)) {
      setSyncStatus(`「${name}」はすでに登録されています`, true);
      return;
    }
    exercises.push(name);
    exercises.sort(MuscleSync.compareExerciseNames);
    saveExercises();
    pushExercisesToGithub({ type: "add", name });

    categories[name] = categorySelect.value;
    saveCategories();
    pushCategoriesToGithub({ type: "set", name, category: categorySelect.value });

    form.reset();
    categoryManuallySet = false;
    updateCategoryAuto();
    render();
  });

  listEl.addEventListener("click", function (e) {
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn) {
      const name = deleteBtn.dataset.name;
      exercises = exercises.filter((n) => n !== name);
      saveExercises();
      pushExercisesToGithub({ type: "delete", name });

      if (categories[name] !== undefined) {
        delete categories[name];
        saveCategories();
        pushCategoriesToGithub({ type: "delete", name });
      }
      render();
      return;
    }
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      const oldName = editBtn.dataset.name;
      const newName = window.prompt("新しい種目名（この種目を使った過去の記録もすべて書き換わります）", oldName);
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      renameExercise(oldName, trimmed);
    }
  });

  function loadExercises() {
    try {
      const raw = localStorage.getItem(EXERCISES_KEY);
      if (raw) return JSON.parse(raw);
      localStorage.setItem(EXERCISES_KEY, JSON.stringify(SEED_EXERCISES));
      return SEED_EXERCISES.slice();
    } catch (err) {
      return [];
    }
  }

  function saveExercises() {
    localStorage.setItem(EXERCISES_KEY, JSON.stringify(exercises));
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveCategories() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }

  function render() {
    countEl.textContent = exercises.length;
    emptyEl.hidden = exercises.length > 0;
    listEl.innerHTML = exercises
      .map(
        (name) => `
      <div class="record-item">
        <div class="record-main">
          <span class="record-exercise">${escapeHtml(name)}</span>
        </div>
        <div class="record-actions">
          <button class="edit-btn" data-name="${escapeHtml(name)}" aria-label="名前を変更">${EDIT_ICON}</button>
          <button class="delete-btn" data-name="${escapeHtml(name)}" aria-label="削除">${DELETE_ICON}</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  function setSyncStatus(text, isError, isOk) {
    syncStatus.textContent = text;
    syncStatus.classList.toggle("sync-error", !!isError);
    syncStatus.classList.toggle("sync-ok", !!isOk && !isError);
  }

  // 種目名の変更(=統合)。登録リストの書き換えに加え、その種目名を使った
  // 過去の記録もすべて新しい名前に書き換えて、履歴・グラフ上で1つにまとめる。
  async function renameExercise(oldName, newName) {
    exercises = exercises.filter((n) => n !== oldName);
    if (!exercises.includes(newName)) exercises.push(newName);
    exercises.sort(MuscleSync.compareExerciseNames);
    saveExercises();
    render();

    if (categories[oldName] !== undefined) {
      const category = categories[oldName];
      delete categories[oldName];
      categories[newName] = category;
      saveCategories();
      pushCategoriesToGithub({ type: "rename", from: oldName, to: newName });
    }

    records = records.map((r) => (r.exercise === oldName ? Object.assign({}, r, { exercise: newName }) : r));
    saveRecords();

    const token = MuscleSync.getToken();
    if (!token) {
      setSyncStatus(`「${oldName}」を「${newName}」に変更しました（この端末のみ）`, false, true);
      return;
    }

    setSyncStatus("種目名を変更中...");
    try {
      // 記録側は他端末の最新を取得してから書き換える(取りこぼし防止)
      const latestRecords = await MuscleSync.getFile(token, RECORDS_PATH);
      const baseRecords = latestRecords.exists ? latestRecords.data : records;
      records = baseRecords.map((r) => (r.exercise === oldName ? Object.assign({}, r, { exercise: newName }) : r));
      saveRecords();
      const recSha = await MuscleSync.putFile(
        token,
        RECORDS_PATH,
        records,
        latestRecords.exists ? latestRecords.sha : null,
        `Rename exercise ${oldName} -> ${newName}`
      );
      recordsSha = recSha;

      await pushExercisesToGithub({ type: "rename", from: oldName, to: newName });
      setSyncStatus(`「${oldName}」を「${newName}」に変更しました・${MuscleSync.nowTime()}`, false, true);
    } catch (err) {
      setSyncStatus(`GitHub同期エラー: ${err.message}`, true);
    }
  }

  async function syncFromGithub() {
    const token = MuscleSync.getToken();
    if (!token) return;
    setSyncStatus("GitHub同期: 確認中...");
    try {
      const result = await MuscleSync.getFile(token, EXERCISES_PATH);
      if (!result.exists) {
        const sha = await MuscleSync.putFile(token, EXERCISES_PATH, exercises, null, "Initial exercise list sync");
        exercisesSha = sha;
        setSyncStatus(`GitHub同期: 有効（この端末の種目で初期化しました・${MuscleSync.nowTime()}）`, false, true);
      } else {
        const merged = MuscleSync.mergeNames(exercises, result.data);
        const recovered = merged.length !== result.data.length;
        exercises = merged.sort(MuscleSync.compareExerciseNames);
        exercisesSha = result.sha;
        saveExercises();
        render();
        if (recovered) {
          await pushExercisesToGithub(null);
        } else {
          setSyncStatus(`GitHub同期: 有効（最終同期 ${MuscleSync.nowTime()}）`, false, true);
        }
      }
    } catch (err) {
      setSyncStatus(`GitHub同期エラー: ${err.message}`, true);
    }
  }

  function applyPendingChange(baseNames, pendingChange) {
    if (!pendingChange) return baseNames.slice();
    if (pendingChange.type === "add") {
      return baseNames.includes(pendingChange.name) ? baseNames.slice() : baseNames.concat([pendingChange.name]);
    }
    if (pendingChange.type === "delete") {
      return baseNames.filter((n) => n !== pendingChange.name);
    }
    if (pendingChange.type === "rename") {
      const withoutOld = baseNames.filter((n) => n !== pendingChange.from);
      return withoutOld.includes(pendingChange.to) ? withoutOld : withoutOld.concat([pendingChange.to]);
    }
    return baseNames.slice();
  }

  async function pushExercisesToGithub(pendingChange) {
    const token = MuscleSync.getToken();
    if (!token) return;
    try {
      const sha = await MuscleSync.putFile(token, EXERCISES_PATH, exercises, exercisesSha, "Update exercise list");
      exercisesSha = sha;
      setSyncStatus(`GitHub同期: 有効（最終同期 ${MuscleSync.nowTime()}）`, false, true);
    } catch (err) {
      if (err.conflict) {
        try {
          const result = await MuscleSync.getFile(token, EXERCISES_PATH);
          exercises = applyPendingChange(result.data, pendingChange);
          exercises.sort(MuscleSync.compareExerciseNames);
          saveExercises();
          render();
          const sha2 = await MuscleSync.putFile(token, EXERCISES_PATH, exercises, result.sha, "Update exercise list (merged)");
          exercisesSha = sha2;
          setSyncStatus(`GitHub同期: 有効（他の端末の更新と統合しました・${MuscleSync.nowTime()}）`, false, true);
        } catch (err2) {
          setSyncStatus(`GitHub同期エラー: ${err2.message}`, true);
        }
      } else {
        setSyncStatus(`GitHub同期エラー: ${err.message}`, true);
      }
    }
  }

  // 部位の対応表は補助的なデータなので、同期エラーがあっても種目同期の
  // ステータス表示は上書きしない(静かに失敗させる)。
  async function syncCategoriesFromGithub() {
    const token = MuscleSync.getToken();
    if (!token) return;
    try {
      const result = await MuscleSync.getFile(token, CATEGORIES_PATH);
      if (!result.exists) {
        const sha = await MuscleSync.putFile(token, CATEGORIES_PATH, categories, null, "Initial exercise categories sync");
        categoriesSha = sha;
      } else {
        const merged = MuscleSync.mergeMap(categories, result.data);
        const recovered = Object.keys(merged).length !== Object.keys(result.data).length;
        categories = merged;
        categoriesSha = result.sha;
        saveCategories();
        if (recovered) await pushCategoriesToGithub(null);
      }
    } catch (err) {
      console.error("categories sync failed", err);
    }
  }

  function applyPendingCategoryChange(baseMap, pendingChange) {
    const result = Object.assign({}, baseMap);
    if (!pendingChange) return result;
    if (pendingChange.type === "set") {
      result[pendingChange.name] = pendingChange.category;
    } else if (pendingChange.type === "delete") {
      delete result[pendingChange.name];
    } else if (pendingChange.type === "rename") {
      if (result[pendingChange.from] !== undefined) {
        result[pendingChange.to] = result[pendingChange.from];
        delete result[pendingChange.from];
      }
    }
    return result;
  }

  async function pushCategoriesToGithub(pendingChange) {
    const token = MuscleSync.getToken();
    if (!token) return;
    try {
      const sha = await MuscleSync.putFile(token, CATEGORIES_PATH, categories, categoriesSha, "Update exercise categories");
      categoriesSha = sha;
    } catch (err) {
      if (err.conflict) {
        try {
          const result = await MuscleSync.getFile(token, CATEGORIES_PATH);
          categories = applyPendingCategoryChange(result.data, pendingChange);
          saveCategories();
          const sha2 = await MuscleSync.putFile(token, CATEGORIES_PATH, categories, result.sha, "Update exercise categories (merged)");
          categoriesSha = sha2;
        } catch (err2) {
          console.error("categories sync failed", err2);
        }
      } else {
        console.error("categories sync failed", err);
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
