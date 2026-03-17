from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


Stats = Dict[str, int]


@dataclass
class GameState:
    cycle: int = 1
    stats: Stats = field(default_factory=lambda: {"fear": 0, "control": 0, "logic": 0, "trust": 0})
    current_scene_id: str = ""
    ended: bool = False
    last_scene_id: Optional[str] = None


class SceneStore:
    def __init__(self, data: Dict[str, Any]):
        self.data = data
        self.rules = data.get("rules", {})
        self.entry = data.get("entry")
        self.scenes_by_id: Dict[str, Dict[str, Any]] = {}
        for s in data.get("scenes", []):
            self.scenes_by_id[s["id"]] = s

    @classmethod
    def load_from_file(cls, path: str) -> "SceneStore":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(data)

    def get(self, scene_id: str) -> Dict[str, Any]:
        if scene_id not in self.scenes_by_id:
            raise KeyError(f"Scene not found: {scene_id}")
        return self.scenes_by_id[scene_id]

    def dominance_check(self, stats: Stats) -> Tuple[bool, Optional[str]]:
        dom = self.rules.get("dominance", {})
        threshold = int(dom.get("threshold", 6))
        lead_by = int(dom.get("leadBy", 2))
        sorted_stats = sorted(stats.items(), key=lambda kv: kv[1], reverse=True)
        top_name, top_val = sorted_stats[0]
        second_val = sorted_stats[1][1] if len(sorted_stats) > 1 else -10**9

        if top_val >= threshold and (top_val - second_val) >= lead_by:
            return True, top_name
        return False, None

    def max_cycles(self) -> int:
        return int(self.rules.get("maxCycles", 5))

    def pick_cycle_entry(self, cycle: int) -> str:
        # Минимальная логика: для цикла 1 берём entry, для 2+ пробуем конкретный ID,
        # иначе падаем обратно на entry.
        if cycle == 1 and self.entry:
            return self.entry
        if cycle == 2 and "c2_capsule_wake_v2" in self.scenes_by_id:
            return "c2_capsule_wake_v2"
        # На будущее: можно добавить карту cycle->entry
        return self.entry or "c1_capsule_wake"

    def maybe_inject_anomaly(self, cycle: int) -> Optional[str]:
        # Вставка аномалии по шансам: цикл 2 ~8%, цикл 3 ~12%, цикл 4 ~10%
        # Цикл 1 — 0%, цикл 5 — 0% (стерильно)
        if cycle <= 1 or cycle >= 5:
            return None
        chance = {2: 0.08, 3: 0.12, 4: 0.10}.get(cycle, 0.0)
        if random.random() > chance:
            return None

        anomalies = [sid for sid, s in self.scenes_by_id.items() if s.get("type") == "anomaly"]
        return random.choice(anomalies) if anomalies else None


class Engine:
    def __init__(self, store: SceneStore):
        self.store = store
        self.state = GameState()
        self.reset(full=True)

    def reset(self, full: bool = True) -> None:
        if full:
            self.state = GameState()
        self.state.cycle = self.state.cycle if not full else 1
        self.state.ended = False
        self.state.last_scene_id = None
        self.state.current_scene_id = self.store.pick_cycle_entry(self.state.cycle)

    def _apply_delta(self, delta: Dict[str, int]) -> None:
        for k, v in delta.items():
            if k not in self.state.stats:
                continue
            self.state.stats[k] += int(v)

    def _end_cycle(self) -> None:
        # Проверяем доминирование
        done, dom = self.store.dominance_check(self.state.stats)
        if done:
            self.state.ended = True
            # финал пока выдаём одной "виртуальной" сценой
            self.state.current_scene_id = f"system_final_{dom}"
            return

        # иначе следующий цикл
        self.state.cycle += 1
        if self.state.cycle > self.store.max_cycles():
            # если не сформировалось — всё равно финалим по максимуму
            dom = max(self.state.stats.items(), key=lambda kv: kv[1])[0]
            self.state.ended = True
            self.state.current_scene_id = f"system_final_{dom}"
            return

        self.state.current_scene_id = self.store.pick_cycle_entry(self.state.cycle)

    def get_render_scene(self) -> Dict[str, Any]:
        sid = self.state.current_scene_id

        # виртуальные финальные сцены
        if sid.startswith("system_final_"):
            dom = sid.replace("system_final_", "")
            return {
                "id": sid,
                "cycle": self.state.cycle,
                "text": f"ТЕСТ ЗАВЕРШЁН.\nОбъект: Клон №47.\nНазначение: {self._role_from_dom(dom)}",
                "effects": ["sterile_silence", "light_white"],
                "choices": [
                    {"text": "Завершить", "next": "system_restart", "delta": {}}
                ],
                "meta": {"ended": True, "dominant": dom, "stats": self.state.stats}
            }

        if sid == "system_restart":
            return {
                "id": "system_restart",
                "cycle": self.state.cycle,
                "text": "Следующий.",
                "effects": ["flash_subtle"],
                "choices": [
                    {"text": "Начать заново", "next": "system_reset_full", "delta": {}}
                ],
                "meta": {"ended": True, "stats": self.state.stats}
            }

        scene = self.store.get(sid)
        payload = dict(scene)
        payload.setdefault("meta", {})
        payload["meta"]["cycle"] = self.state.cycle
        payload["meta"]["stats"] = self.state.stats
        payload["meta"]["ended"] = self.state.ended
        return payload

    def choose(self, choice_index: int) -> Dict[str, Any]:
        sid = self.state.current_scene_id

        # обработка виртуальных сцен
        if sid.startswith("system_final_"):
            if choice_index != 0:
                choice_index = 0
            self.state.current_scene_id = "system_restart"
            return self.get_render_scene()

        if sid == "system_restart":
            self.state.current_scene_id = "system_reset_full"
            return self.get_render_scene()

        if sid == "system_reset_full":
            self.reset(full=True)
            return self.get_render_scene()

        scene = self.store.get(sid)
        choices = scene.get("choices", [])
        if not choices:
            # если вдруг нет вариантов — заканчиваем цикл
            self._end_cycle()
            return self.get_render_scene()

        if choice_index < 0 or choice_index >= len(choices):
            raise ValueError("Invalid choice index")

        choice = choices[choice_index]
        delta = choice.get("delta", {})
        self._apply_delta(delta)

        self.state.last_scene_id = sid
        next_id = choice.get("next")

        # спец-узел конца цикла
        if next_id == "system_cycle_end":
            # шанс на аномалию перед концом цикла (напряжение)
            anomaly = self.store.maybe_inject_anomaly(self.state.cycle)
            if anomaly:
                self.state.current_scene_id = anomaly
                return self.get_render_scene()

            self._end_cycle()
            return self.get_render_scene()

        # обычный переход
        if not next_id:
            self._end_cycle()
            return self.get_render_scene()

        self.state.current_scene_id = next_id
        return self.get_render_scene()

    def _role_from_dom(self, dom: str) -> str:
        mapping = {
            "fear": "Sentinel / Threat Monitor",
            "control": "Protocol Officer",
            "logic": "Systems Analyst",
            "trust": "Crew Liaison"
        }
        return mapping.get(dom, "Undeclared")