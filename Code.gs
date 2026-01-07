function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Birthday Populator')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * NEW: Uses People API to list contacts
 */
function handleSearch(nameInput, dateString) {
  var searchName = nameInput.toLowerCase().trim();
  
  // Fetch contacts (max 1000 for simplicity) with necessary fields
  try {
    var response = People.People.Connections.list('people/me', {
      personFields: 'names,birthdays,emailAddresses,organizations',
      pageSize: 1000
    });
  } catch (e) {
    return { status: 'ERROR', message: "API Error: " + e.message };
  }

  var connections = response.connections || [];
  var candidates = [];
  var exactMatches = [];

  for (var i = 0; i < connections.length; i++) {
    var person = connections[i];
    var pNameObj = person.names ? person.names[0] : null;
    if (!pNameObj) continue;

    var pName = pNameObj.displayName;
    var pNameLower = pName.toLowerCase();
    
    // Serialized contact object
    var serialized = serializePerson(person);

    // Exact Match
    if (pNameLower === searchName) {
      exactMatches.push(serialized);
    } else {
      // Fuzzy Score
      var dist = levenshtein(searchName, pNameLower);
      if (dist <= 5) {
        candidates.push({ contact: serialized, score: dist });
      }
    }
  }

  if (exactMatches.length > 0) return { status: 'EXACT_MATCH', candidates: exactMatches };
  
  if (candidates.length > 0) {
    candidates.sort(function(a, b) { return a.score - b.score; });
    var topCandidates = candidates.slice(0, 5).map(function(c) { return c.contact; });
    return { status: 'FUZZY_MATCH', candidates: topCandidates };
  }

  return { status: 'NO_MATCH', candidates: [] };
}

/**
 * Helper: Maps People API Person object to our simple format
 */
function serializePerson(person) {
  var emails = person.emailAddresses ? person.emailAddresses.map(function(e) { return e.value; }).join(", ") : "";
  var companies = person.organizations ? person.organizations.map(function(o) { return o.name; }).join(", ") : "";
  
  var bdayObj = null;
  var bdayStr = null;

  if (person.birthdays && person.birthdays.length > 0) {
    var date = person.birthdays[0].date; // {year, month, day}
    if (date) {
      bdayObj = {
        day: date.day,
        month: date.month, // People API uses 1-based months (1 = Jan)
        year: date.year // Can be undefined
      };
      
      // Display String
      var months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      bdayStr = months[date.month] + " " + date.day;
      if (date.year) bdayStr += ", " + date.year;
    }
  }

  return {
    id: person.resourceName, // Look like "people/c123456"
    name: person.names[0].displayName,
    email: emails,
    company: companies,
    birthdayRaw: bdayObj,
    birthdayDisplay: bdayStr
  };
}

/**
 * Logic to Check/Update specific contact
 */
function processSelectedContact(resourceName, inputDateStr) {
  // 1. Fetch latest data for this person (need etag)
  var person = People.People.get(resourceName, { personFields: 'birthdays,names' });
  var inputParts = parseInputDate(inputDateStr); // {year, month, day}

  var existingBirthdays = person.birthdays || [];
  
  // Case 1: No Existing Birthday -> Add
  if (existingBirthdays.length === 0) {
    return updatePersonBirthday(person, inputParts);
  }

  // Case 2: Compare
  var existing = existingBirthdays[0].date; // {year, month, day}
  
  var sameMonth = (existing.month === inputParts.month);
  var sameDay = (existing.day === inputParts.day);

  if (sameMonth && sameDay) {
    if (!existing.year) {
      // Missing year -> UPDATE to add year
      return updatePersonBirthday(person, inputParts);
    } else if (existing.year === inputParts.year) {
      // Exact Match -> Ignore
      return { success: true, message: "Birthday already exact. No changes." };
    } else {
      // Different Year -> Conflict
      return { success: false, error: "CONFLICT", message: "Same day, different year! Existing: " + existing.year + ", Input: " + inputParts.year };
    }
  } else {
    // Different Date -> Conflict
    return { success: false, error: "CONFLICT", message: "Conflict! Existing is " + existing.month + "/" + existing.day };
  }
}

/**
 * Force overwrite logic
 */
function forceUpdate(resourceName, inputDateStr) {
  var person = People.People.get(resourceName, { personFields: 'birthdays' });
  var inputParts = parseInputDate(inputDateStr);
  return updatePersonBirthday(person, inputParts);
}

/**
 * Core Update Function using People API
 */
function updatePersonBirthday(person, dateParts) {
  // Construct the resource to patch
  var contactToUpdate = {
    etag: person.etag, // REQUIRED for People API
    birthdays: [{
      date: {
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day
      }
    }]
  };

  try {
    People.People.updateContact(person.resourceName, contactToUpdate, { updatePersonFields: 'birthdays' });
    return { success: true, message: "Birthday updated successfully." };
  } catch (e) {
    return { success: false, message: "Error updating: " + e.message };
  }
}

function createNewContact(name, dateStr) {
  var parts = parseInputDate(dateStr);
  
  var contact = {
    names: [{ givenName: name }],
    birthdays: [{
      date: {
        year: parts.year,
        month: parts.month,
        day: parts.day
      }
    }]
  };

  try {
    People.People.createContact(contact);
    return { success: true, message: "Created new contact: " + name };
  } catch(e) {
    return { success: false, message: "Error creating: " + e.message };
  }
}

// --- Utilities ---

function parseInputDate(dateStr) {
  // Input is YYYY-MM-DD
  var parts = dateStr.split('-');
  return {
    year: parseInt(parts[0]),
    month: parseInt(parts[1]), // Input is 01-12, perfect for People API
    day: parseInt(parts[2])
  };
}

function levenshtein(a, b) {
  var tmp;
  if (a.length === 0) { return b.length; }
  if (b.length === 0) { return a.length; }
  if (a.length > b.length) { tmp = a; a = b; b = tmp; }

  var row = [];
  for (var i = 0; i <= a.length; i++) { row[i] = i; }

  for (var i = 1; i <= b.length; i++) {
    var prev = i;
    for (var j = 1; j <= a.length; j++) {
      var val;
      if (b.charAt(i-1) === a.charAt(j-1)) { val = row[j-1]; }
      else { val = Math.min(row[j-1] + 1, Math.min(prev + 1, row[j] + 1)); }
      row[j-1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}