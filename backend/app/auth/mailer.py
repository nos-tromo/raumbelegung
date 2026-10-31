"""Outgoing mail: Jinja2 templates + pluggable backend (smtp, console, memory)."""

import logging
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path
from typing import Any

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import Settings, get_settings

log = logging.getLogger("app.mail")

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=False),
    keep_trailing_newline=True,
)

SUBJECTS = {
    "verify": "Bitte bestätige deine E-Mail-Adresse",
    "reset": "Passwort zurücksetzen",
    "invite": "Einladung zum Kalender „{calendar_name}“",
}


@dataclass
class SentMail:
    to: str
    subject: str
    text: str
    html: str
    template: str
    context: dict[str, Any] = field(default_factory=dict)


# In-process outbox for MAIL_BACKEND=memory (tests).
outbox: list[SentMail] = []


def render(template: str, **context: Any) -> SentMail:
    subject = SUBJECTS[template].format(**context)
    text = _env.get_template(f"{template}.txt").render(**context)
    html = _env.get_template(f"{template}.html").render(subject=subject, **context)
    return SentMail(
        to=context["to"], subject=subject, text=text, html=html, template=template, context=context
    )


def _build_message(mail: SentMail, settings: Settings) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = settings.MAIL_FROM
    msg["To"] = mail.to
    msg["Subject"] = mail.subject
    domain = settings.MAIL_FROM.rsplit("@", 1)[-1].strip(" >") or None
    msg["Message-ID"] = make_msgid(domain=domain)
    msg.set_content(mail.text)
    msg.add_alternative(mail.html, subtype="html")
    return msg


async def deliver(mail: SentMail, settings: Settings | None = None) -> None:
    """Send one mail. Errors are logged, never raised (runs as a background task)."""
    settings = settings or get_settings()
    try:
        if settings.MAIL_BACKEND == "memory":
            outbox.append(mail)
        elif settings.MAIL_BACKEND == "console":
            log.info("MAIL to=%s subject=%s\n%s", mail.to, mail.subject, mail.text)
        else:
            await aiosmtplib.send(
                _build_message(mail, settings),
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER or None,
                password=settings.SMTP_PASSWORD or None,
                start_tls=settings.SMTP_STARTTLS and not settings.SMTP_SSL,
                use_tls=settings.SMTP_SSL,
                timeout=30,
            )
            log.info("mail sent to=%s template=%s", mail.to, mail.template)
    except Exception:
        log.exception("sending mail to %s failed", mail.to)


async def send_template(template: str, **context: Any) -> None:
    await deliver(render(template, **context))
