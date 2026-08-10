/**
 * Utility for parsing iCal (.ics) feeds and Google Calendar events into Dailie format
 */

export function parseICSFeed(icsData) {
  const events = [];
  const lines = icsData.split(/\r\n|\n|\r/);
  let currentEvent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === 'BEGIN:VEVENT') {
      currentEvent = { id: 'ics-' + Math.random().toString(36).slice(2, 9), followUps: [] };
    } else if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.title) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.title = line.replace('SUMMARY:', '').trim();
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.notes = line.replace('DESCRIPTION:', '').trim().replace(/\\n/g, '\n');
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.location = line.replace('LOCATION:', '').trim();
      } else if (line.startsWith('DTSTART:')) {
        const dtStr = line.replace('DTSTART:', '').trim();
        currentEvent.date = parseICSDate(dtStr);
      }
    }
  }

  return events;
}

function parseICSDate(dtStr) {
  // Parses YYYYMMDDTHHMMSSZ or YYYYMMDD
  try {
    const clean = dtStr.replace(/[^0-9T]/g, '');
    if (clean.length >= 8) {
      const year = parseInt(clean.slice(0, 4), 10);
      const month = parseInt(clean.slice(4, 6), 10) - 1;
      const day = parseInt(clean.slice(6, 8), 10);
      let hour = 12, min = 0;
      if (clean.length >= 13) {
        hour = parseInt(clean.slice(9, 11), 10);
        min = parseInt(clean.slice(11, 13), 10);
      }
      return new Date(Date.UTC(year, month, day, hour, min)).getTime();
    }
  } catch (e) {}
  return Date.now();
}

export function parseGmailTextInvite(rawEmailText) {
  // Extract Subject, Date, Attendees, and Notes from pasted Gmail invite or email thread
  const lines = rawEmailText.split(/\r\n|\n|\r/);
  let title = 'Gmail Meeting Sync';
  let attendees = 'Gmail Contacts';
  let notes = rawEmailText;

  for (const line of lines) {
    if (/^Subject:/i.test(line)) {
      title = line.replace(/^Subject:/i, '').trim();
    } else if (/^(From|To|Cc):/i.test(line)) {
      if (attendees === 'Gmail Contacts') attendees = line.replace(/^(From|To|Cc):/i, '').trim();
      else attendees += ', ' + line.replace(/^(From|To|Cc):/i, '').trim();
    }
  }

  return {
    id: 'gmail-' + Date.now().toString(36),
    title,
    date: Date.now(),
    attendees: attendees.slice(0, 120),
    notes,
    followUps: [
      { id: 'f-' + Math.random().toString(36).slice(2, 8), text: 'Review synced Gmail notes', owner: 'Producer', done: false }
    ]
  };
}
