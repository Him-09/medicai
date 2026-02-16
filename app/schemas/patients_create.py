"""Patient creation schemas"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal, List
from datetime import date


class PatientCreateIn(BaseModel):
    """Schema for creating a new patient"""
    name: str = Field(..., min_length=1, description="Patient full name")
    dob: str = Field(..., description="Date of birth (YYYY-MM-DD)")
    sex: Optional[Literal["M", "F"]] = Field(None, description="Patient sex (M or F)")
    email: Optional[EmailStr] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    medical_history: Optional[str] = Field(None, description="Brief medical history")
    allergies: Optional[List[str]] = Field(None, description="Patient allergies")
    active_problems: Optional[List[str]] = Field(None, description="Active medical problems")


class PatientUpdateIn(BaseModel):
    """Schema for updating a patient (partial updates allowed)"""
    name: Optional[str] = Field(None, min_length=1, description="Patient full name")
    dob: Optional[str] = Field(None, description="Date of birth (YYYY-MM-DD)")
    sex: Optional[Literal["M", "F"]] = Field(None, description="Patient sex (M or F)")
    email: Optional[EmailStr] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    medical_history: Optional[str] = Field(None, description="Brief medical history")
    allergies: Optional[List[str]] = Field(None, description="Patient allergies")
    active_problems: Optional[List[str]] = Field(None, description="Active medical problems")
    status: Optional[Literal["active", "archived"]] = Field(None, description="Patient status")


class PatientCreateOut(BaseModel):
    """Schema for patient creation response"""
    patient_id: str = Field(..., description="Generated patient ID")
    name: str
    dob: str
    sex: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = "active"
    message: str = "Patient created successfully"
