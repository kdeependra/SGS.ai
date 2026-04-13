from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from api.schemas.auth import LoginRequest, LoginResponse
from services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
security = HTTPBearer()


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = auth_service.decode_token(creds.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = auth_service.get_user_by_id(int(payload["sub"]))
    if user is None or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    user = auth_service.authenticate_user(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = auth_service.create_token(user)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user


@router.get("/users")
def get_users(user: dict = Depends(require_admin)):
    return auth_service.list_users()
