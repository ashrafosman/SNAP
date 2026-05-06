from fastapi import APIRouter, HTTPException
from server import config_store

router = APIRouter()


@router.get("/settings/config")
def get_config():
    return config_store.read_config()


@router.put("/settings/config")
def put_config(data: dict):
    try:
        return config_store.write_config(data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
