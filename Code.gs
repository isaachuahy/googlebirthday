function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Birthday Populator')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Main handler called by frontend.
 * 1. Exact Match Search
 * 2. Fuzzy Search if no exact match
 * 3. Returns status and candidates to frontend
 */
function handleSearch(nameInput, dateString) {
  var contacts = ContactsApp.getContacts(); // Note: Gets all contacts. Slow for 5k+ contacts, fine for personal use.
  
  var searchName = nameInput.toLowerCase().trim();
  var candidates = [];
  var exactMatches = [];

  // 1. Iterate and Score
  for (var i = 0; i < contacts.length; i++) {
    var contact = contacts[i];
    var cName = contact.getFullName();
    var cNameLower = cName.toLowerCase();
    
    // Skip empty names
    if (!cName) continue;

    // Exact Match
    if (cNameLower === searchName) {
      exactMatches.push(serializeContact(contact));
    } else {
      // Fuzzy Score
      var dist = levenshtein(searchName, cNameLower);
      // Threshold: Allow errors proportional to length, but max 5 distance
      if (dist <= 5) {
        candidates.push({
          contact: serializeContact(contact),
          score: dist
        });
      }
    }
  }

  // 2. Logic: Return Exact Matches first
  if (exactMatches.length > 0) {
    return { status: 'EXACT_MATCH', candidates: exactMatches };
  }

  // 3. Logic: If no exact, return top 5 fuzzy matches
  if (candidates.length > 0) {
    candidates.sort(function(a, b) { return a.score - b.score; });
    var topCandidates = candidates.slice(0, 5).map(function(c) { return c.contact; });
    return { status: 'FUZZY_MATCH', candidates: topCandidates };
  }

  // 4. No matches found
  return { status: 'NO_MATCH', candidates: [] };
}

/**
 * Helper to turn a Google Contact object into a simple JSON
 */
function serializeContact(contact) {
  var emails = contact.getEmails().map(function(e) { return e.getAddress(); }).join(", ");
  var companies = contact.getCompanies().map(function(c) { return c.getCompanyName(); }).join(", ");
  
  // Get Birthday
  var bdayDate = contact.getDates(ContactsApp.Field.BIRTHDAY)[0];
  var bdayStr = null;
  var bdayObj = null;

  if (bdayDate) {
    // Note: getMonth() is 0-indexed in JS enum, but ContactsApp returns distinct Month enum.
    // We strictly need the Day/Month/Year.
    bdayObj = {
      day: bdayDate.getDay(),
      month: bdayDate.getMonth(), // Enum: JANUARY is usually mapped standardly
      year: bdayDate.getYear() // Can be null
    };
    
    // Formatting for display
    var m = bdayDate.getMonth(); 
    // Convert Enum to readable string if possible or map manually. 
    // Easier hack: standard JS Date mapping
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // ContactsApp.Month.JANUARY is an Object, not an int. We need to parse strictly.
    // Simpler approach for display:
    bdayStr = months[Object.keys(ContactsApp.Month).indexOf(String(bdayDate.getMonth()))] + " " + bdayDate.getDay();
    if (bdayDate.getYear()) bdayStr += ", " + bdayDate.getYear();
  }

  return {
    id: contact.getId(),
    name: contact.getFullName(),
    email: emails,
    company: companies,
    birthdayRaw: bdayObj,
    birthdayDisplay: bdayStr
  };
}

/**
 * Called when user selects a specific contact to update
 */
function processSelectedContact(contactId, inputDateStr) {
  var contact = ContactsApp.getContactById(contactId);
  var existingDates = contact.getDates(ContactsApp.Field.BIRTHDAY);
  var existing = existingDates.length > 0 ? existingDates[0] : null;

  // Parse Input Date (YYYY-MM-DD)
  var parts = inputDateStr.split('-');
  var inYear = parseInt(parts[0]);
  var inMonth = getMonthEnum(parseInt(parts[1])); // Helper to get Enum
  var inDay = parseInt(parts[2]);

  // Case 1: No Existing Birthday -> Create
  if (!existing) {
    contact.addDate(ContactsApp.Field.BIRTHDAY, inMonth, inDay, inYear);
    return { success: true, message: "Added birthday to " + contact.getFullName() };
  }

  // Case 2: Existing Birthday -> Compare
  var exDay = existing.getDay();
  var exMonth = existing.getMonth(); // This is an Enum
  var exYear = existing.getYear();

  // Check Month/Day match
  // We compare Enums by getting their string key or index. 
  var monthMatch = (String(exMonth) == String(inMonth));
  var dayMatch = (exDay == inDay);

  if (monthMatch && dayMatch) {
    if (!exYear) {
      // Logic: Same day, missing year -> Update
      existing.deleteDate(); // Delete old
      contact.addDate(ContactsApp.Field.BIRTHDAY, inMonth, inDay, inYear); // Add new with year
      return { success: true, message: "Updated existing birthday with Year " + inYear };
    } else if (exYear == inYear) {
      // Logic: Exact match -> Ignore
      return { success: true, message: "Birthday already exact. No changes made." };
    } else {
      // Logic: Different Year -> Error/Confirm
      return { success: false, error: "CONFLICT", message: "Same day, but different year! Existing: " + exYear + ", Input: " + inYear };
    }
  } else {
    // Logic: Totally different date -> Error/Confirm
    return { success: false, error: "CONFLICT", message: "Conflict! Existing birthday is: " + formatEnum(exMonth) + " " + exDay };
  }
}

function forceUpdate(contactId, inputDateStr) {
   var contact = ContactsApp.getContactById(contactId);
   // Clear all birthdays to be safe
   var dates = contact.getDates(ContactsApp.Field.BIRTHDAY);
   for (var i=0; i<dates.length; i++) dates[i].deleteDate();

   var parts = inputDateStr.split('-');
   contact.addDate(ContactsApp.Field.BIRTHDAY, getMonthEnum(parseInt(parts[1])), parseInt(parts[2]), parseInt(parts[0]));
   return { success: true, message: "Force updated birthday." };
}

function createNewContact(name, dateStr) {
  var parts = dateStr.split('-');
  var contact = ContactsApp.createContact(name, "", "");
  contact.addDate(ContactsApp.Field.BIRTHDAY, getMonthEnum(parseInt(parts[1])), parseInt(parts[2]), parseInt(parts[0]));
  return { success: true, message: "Created new contact: " + name };
}

// --- Utilities ---

// Levenshtein Implementation
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

function getMonthEnum(monthInt) {
  var map = [
    ContactsApp.Month.JANUARY, ContactsApp.Month.FEBRUARY, ContactsApp.Month.MARCH,
    ContactsApp.Month.APRIL, ContactsApp.Month.MAY, ContactsApp.Month.JUNE,
    ContactsApp.Month.JULY, ContactsApp.Month.AUGUST, ContactsApp.Month.SEPTEMBER,
    ContactsApp.Month.OCTOBER, ContactsApp.Month.NOVEMBER, ContactsApp.Month.DECEMBER
  ];
  return map[monthInt - 1];
}

function formatEnum(enumVal) {
   // Quick dirty map for display
   var str = String(enumVal);
   return str.substring(0,3); // JAN, FEB...
}