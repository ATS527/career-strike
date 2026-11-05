import type { Interview, ProfileFact } from './api';

/** Generates RFC-5545 iCalendar content for an interview. */
export function generateInterviewIcsContent(params: {
  interview: Interview;
  employer: string;
  jobTitle: string;
}): string {
  const { interview, employer, jobTitle } = params;
  const dt = new Date(interview.scheduledAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const start = formatUtc(dt);
  const end = formatUtc(new Date(dt.getTime() + 60 * 60 * 1000));
  const now = formatUtc(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Career Strike//Candidate Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cs-int-${interview.id}@careerstrike.local`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Interview: ${interview.stage} (${jobTitle} at ${employer})`,
    `DESCRIPTION:Stage: ${interview.stage}\\nCompany: ${employer}\\nRole: ${jobTitle}\\nFormat: ${interview.format}\\n\\nPrep in Career Strike: Open dashboard to review matched STAR stories and requirements.`,
    `LOCATION:${interview.format === 'video' ? 'Video Conference' : interview.format === 'phone' ? 'Phone Call' : employer}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/** Generates and triggers download of an RFC-5545 .ics iCalendar file for scheduled interviews. */
export function downloadInterviewIcs(params: { interview: Interview; employer: string; jobTitle: string }): void {
  if (typeof document === 'undefined') return;

  const { interview, employer, jobTitle } = params;
  const content = generateInterviewIcsContent({ interview, employer, jobTitle });
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeEmployer = employer.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const safeStage = interview.stage.toLowerCase().replace(/[^a-z0-9]/g, '-');
  a.download = `interview-${safeEmployer}-${safeStage}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type OutreachKind = 'status_inquiry' | 'post_interview_thanks' | 'offer_next_steps';

export interface OutreachTemplate {
  subject: string;
  body: string;
}

/** Builds a professional, concise, respectful outreach email draft based on real application facts. */
export function buildOutreachDraft(params: {
  kind: OutreachKind;
  employer: string;
  title: string;
  candidateName?: string;
  contactName?: string;
  interviewStage?: string;
  discussionHighlight?: string;
}): OutreachTemplate {
  const {
    kind,
    employer,
    title,
    candidateName = 'Candidate',
    contactName = '',
    interviewStage = 'our recent interview',
    discussionHighlight = '',
  } = params;

  const greeting = contactName.trim() ? `Dear ${contactName.trim()},` : `Hello ${employer} Team,`;

  if (kind === 'status_inquiry') {
    return {
      subject: `Following up on my application: ${title} — ${candidateName}`,
      body: `${greeting}

I hope you are having a productive week.

I am writing to respectfully check in on the status of my application for the ${title} position at ${employer}.

Having reviewed the team's engineering mission and objectives, I remain very excited about the opportunity to contribute my experience in building reliable, high-performance systems to your team.

Please let me know if there are any additional details, portfolio links, or work samples I can provide to assist in your review. Thank you for your time and consideration.

Best regards,
${candidateName}`,
    };
  }

  if (kind === 'post_interview_thanks') {
    const highlightSentence = discussionHighlight.trim()
      ? `\nI especially enjoyed our discussion regarding ${discussionHighlight.trim()}. It reaffirmed my enthusiasm for how the team approaches engineering craft and problem solving.\n`
      : '';

    return {
      subject: `Thank you — ${interviewStage} for ${title}`,
      body: `${greeting}

Thank you for taking the time to speak with me today regarding the ${title} role at ${employer}.
${highlightSentence}
I am confident that my background aligns closely with the team's goals, and I would love the opportunity to contribute directly to ${employer}'s upcoming milestones.

Please let me know if there is any other information I can share as you proceed with the next steps. I look forward to hearing from you.

Warm regards,
${candidateName}`,
    };
  }

  // offer_next_steps
  return {
    subject: `Offer Discussion: ${title} — ${candidateName}`,
    body: `${greeting}

Thank you very much for extending the offer to join ${employer} as ${title}. I am genuinely excited about the team, the vision, and the work ahead.

I am currently reviewing the details of the compensation and benefits package. Could we schedule a brief 15-minute call this week to clarify a few details regarding team start dates and scope?

Thank you once again for your support throughout this interview process.

Best regards,
${candidateName}`,
  };
}

/** Matches a prep topic against candidate verified profile facts (skills, roles, achievements). */
export function findMatchingCareerEvidence(
  topicTitle: string,
  facts: ProfileFact[],
): { skills: string[]; roles: string[] } {
  const normalizedTopic = topicTitle.toLowerCase();
  const tokens = normalizedTopic.split(/[\s,/-]+/).filter((t) => t.length > 2);

  const matchedSkills: string[] = [];
  const matchedRoles: string[] = [];

  for (const fact of facts) {
    if (fact.kind === 'skill' && typeof fact.value.name === 'string') {
      const s = fact.value.name;
      const norm = s.toLowerCase();
      if (tokens.some((tok) => norm.includes(tok) || tok.includes(norm))) {
        if (!matchedSkills.includes(s)) matchedSkills.push(s);
      }
    } else if (fact.kind === 'role' && typeof fact.value.title === 'string' && typeof fact.value.company === 'string') {
      const roleStr = `${fact.value.title} at ${fact.value.company}`;
      const norm = roleStr.toLowerCase();
      if (tokens.some((tok) => norm.includes(tok))) {
        if (!matchedRoles.includes(roleStr)) matchedRoles.push(roleStr);
      }
    }
  }

  return {
    skills: matchedSkills.slice(0, 4),
    roles: matchedRoles.slice(0, 2),
  };
}
