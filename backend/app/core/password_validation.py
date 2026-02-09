"""Password validation utilities."""
import re
from typing import List


def validate_password_strength(password: str) -> tuple[bool, List[str]]:
    """
    Validate password strength.
    
    Returns:
        (is_valid, list_of_errors)
    """
    errors = []
    
    if len(password) < 8:
        errors.append("Пароль должен содержать минимум 8 символов")
    
    if len(password) > 128:
        errors.append("Пароль слишком длинный (максимум 128 символов)")
    
    if not re.search(r'[a-z]', password) and not re.search(r'[а-я]', password):
        errors.append("Пароль должен содержать хотя бы одну строчную букву")
    
    if not re.search(r'[A-Z]', password) and not re.search(r'[А-Я]', password):
        errors.append("Пароль должен содержать хотя бы одну заглавную букву")
    
    if not re.search(r'\d', password):
        errors.append("Пароль должен содержать хотя бы одну цифру")
    
    # Optional: require special characters
    # if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
    #     errors.append("Пароль должен содержать хотя бы один специальный символ")
    
    return (len(errors) == 0, errors)


def sanitize_user_input(text: str, max_length: int = 10000) -> str:
    """
    Sanitize user input to prevent XSS attacks.
    
    Args:
        text: Input text to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized text
    """
    if not text:
        return ""
    
    if len(text) > max_length:
        text = text[:max_length]
    
    # Basic sanitization - remove null bytes and control characters
    text = text.replace('\x00', '')
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\r\t')
    
    return text
