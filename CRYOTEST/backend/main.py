from __future__ import annotations

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from engine import SceneStore, Engine


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCENES_PATH = os.path.join(BASE_DIR, "scenes.json")

store = SceneStore.load_from_file(SCENES_PATH)
engine = Engine(store)

app = FastAPI(title="CRYOTEST API", version="0.1")

# Чтобы фронт с другого порта мог ходить в API (если нужно)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Раздаём фронтенд как статику по / (удобно: один сервер)
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


class ChooseRequest(BaseModel):
    index: int


@app.get("/api/scene")
def get_scene():
    return engine.get_render_scene()


@app.post("/api/choose")
def post_choose(req: ChooseRequest):
    try:
        return engine.choose(req.index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/reset")
def reset():
    engine.reset(full=True)
    return engine.get_render_scene()