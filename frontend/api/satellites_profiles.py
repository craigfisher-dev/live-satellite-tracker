from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def hello():
    return {"message": "hello world"}

@app.get("/satellites/{norad_id}")
def get_satellite(norad_id: int):
    return {"norad_id": norad_id, "name": "fake satellite"}