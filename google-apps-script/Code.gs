/**
 * IT Skills Hub Umerkot — Scholarship applications → Google Sheet + Drive.
 *
 * One-time setup (about 5 minutes):
 * 1. Open the Google Sheet that should store applications
 *    (the same sheet used for website contact messages is fine).
 * 2. Extensions → Apps Script. Add this code as a new file in the project
 *    that already receives website contact messages. Do not replace the
 *    existing contact-form code, and do not add a second doGet.
 *    If a doPost function already exists, move the scholarship block into it
 *    instead of keeping two doPost functions.
 * 3. Click Deploy → New deployment → Type: Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 4. Authorize the requested permissions (Sheets and Drive).
 * 5. Copy the Web app URL (it ends with /exec).
 * 6. Paste that URL into SCHOLARSHIP_SCRIPT_URL in assets/js/scholarship.js.
 * 7. If you change this script later: Deploy → Manage deployments → Edit →
 *    New version → Deploy. The /exec URL stays the same.
 *
 * Each submission adds a row on the "Scholarship Applications" tab.
 * Photographs, CNIC/B-Form copies, and certificates are saved in a private
 * Drive folder named "IT Skills Hub Scholarship Documents". The sheet stores
 * the private file links. Only the Google account that owns this script can open them.
 */

// Leave this blank when the script is opened from the Google Sheet
// (Extensions → Apps Script). If the script is a separate project, paste the
// spreadsheet ID from the sheet URL: /spreadsheets/d/THIS_PART/edit
var SCHOLARSHIP_SPREADSHEET_ID = '';

var SCHOLARSHIP_HEADERS = [
  'Submitted At',
  'Application ID',
  'Status',
  'Name of Applicant',
  "Father's Name",
  'Date of Birth',
  'CNIC/B-Form No.',
  'Gender',
  'Mobile / WhatsApp Number',
  'Email Address',
  'Resident Address',
  'Taluka',
  'District',
  "Father's Occupation",
  "Father's Monthly Income (PKR)",
  "Father's Contact No.",
  'Last Qualification',
  'School / College Name',
  'Passing Year',
  'Obtained Marks',
  'Total Marks',
  'Percentage',
  'Scholarship Courses',
  'Consent',
  'Undertaking',
  'Photo',
  'CNIC/B-Form',
  'Last Degree / Certificate'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  var step = 'start';
  try {
    lock.waitLock(20000);
    locked = true;

    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Empty request.' });
    }
    if (e.postData.contents.length > 7000000) {
      return json_({ ok: false, error: 'Submission is too large.' });
    }

    var data = JSON.parse(e.postData.contents);
    if (data.website_url) {
      return json_({ ok: true });
    }
    if (data.formType !== 'scholarship') {
      return json_({ ok: false, error: 'Unknown form.' });
    }

    var checked = checkApplication_(data);
    if (checked.error) {
      return json_({ ok: false, error: checked.error });
    }

    step = 'sheet';
    var sheet = scholarshipSheet_();
    var status = cnicExists_(sheet, checked.cnic) ? 'Possible duplicate' : 'New';
    step = 'folder';
    var folder = scholarshipFolder_();
    step = 'photo';
    var photoUrl = saveImage_(folder, checked.photo, checked.applicationId, 'photo');
    step = 'cnic file';
    var cnicUrl = saveImage_(folder, checked.cnicFile, checked.applicationId, 'cnic');
    step = 'certificate';
    var degreeUrl = saveImage_(folder, checked.degreeFile, checked.applicationId, 'degree');
    step = 'row';

    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss'),
      checked.applicationId,
      status,
      checked.name,
      checked.fatherName,
      checked.dob,
      checked.cnic,
      checked.gender,
      checked.mobile,
      checked.email,
      checked.address,
      checked.taluka,
      checked.district,
      checked.fatherOccupation,
      checked.fatherIncome,
      checked.fatherContact,
      checked.qualification,
      checked.institute,
      checked.passingYear,
      checked.obtainedMarks,
      checked.totalMarks,
      checked.percentage,
      checked.courses,
      'Yes',
      'Yes',
      photoUrl,
      cnicUrl,
      degreeUrl
    ]);

    return json_({ ok: true, applicationId: checked.applicationId, status: status });
  } catch (err) {
    return json_({ ok: false, error: saveError_(step, err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function saveError_(step, err) {
  var detail = String(err && (err.message || err) || '').replace(/\s+/g, ' ').substring(0, 160);
  if (step === 'sheet' || /NO_SHEET|spreadsheet/i.test(detail)) {
    return 'The Google Sheet is not connected. Open the spreadsheet, choose Extensions, then Apps Script, paste this code, and deploy a new version.';
  }
  if (/permission|Authorization required|specified permissions/i.test(detail)) {
    return 'Google blocked Sheets or Drive access. Deploy a new version of the script and allow both permissions, then submit again.';
  }
  if (/lock/i.test(detail)) {
    return 'The form is busy. Please wait a moment and submit again.';
  }
  if (detail) return 'The application could not be saved (' + step + '). ' + detail;
  return 'The application could not be saved. Please try again.';
}

function checkApplication_(data) {
  var name = letters_(data.name, 3, 60);
  if (!name) return { error: 'Enter a valid applicant name.' };
  var fatherName = letters_(data.fatherName, 3, 60);
  if (!fatherName) return { error: "Enter a valid father's name." };

  var dob = date_(data.dob);
  if (!dob) return { error: 'Enter a valid date of birth.' };

  var cnicDigits = String(data.cnic || '').replace(/\D/g, '');
  if (!/^\d{13}$/.test(cnicDigits)) return { error: 'Enter a 13-digit CNIC or B-Form number.' };
  var cnic = cnicDigits.slice(0, 5) + '-' + cnicDigits.slice(5, 12) + '-' + cnicDigits.slice(12);

  if (data.gender !== 'Male' && data.gender !== 'Female') return { error: 'Select gender.' };
  if (!/^03\d{9}$/.test(String(data.mobile || ''))) return { error: 'Enter a valid mobile number.' };

  var email = String(data.email || '').trim();
  if (email.length > 80 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: 'Enter a valid email address, or leave it blank.' };
  }

  var address = plain_(data.address, 10, 250);
  if (!address) return { error: 'Enter a valid address.' };
  var taluka = plain_(data.taluka, 2, 40);
  if (!taluka) return { error: 'Enter a valid taluka.' };
  var district = plain_(data.district, 2, 40);
  if (!district) return { error: 'Enter a valid district.' };
  var occupation = plain_(data.fatherOccupation, 2, 60);
  if (!occupation) return { error: "Enter a valid father's occupation." };

  var income = wholeNumber_(data.fatherIncome, 0, 99999999);
  if (income === null) return { error: 'Enter a valid monthly income.' };
  if (!/^03\d{9}$/.test(String(data.fatherContact || ''))) return { error: "Enter a valid father's contact number." };

  var qualification = qualification_(data.qualification);
  if (!qualification) return { error: 'Enter a valid qualification.' };
  var institute = plain_(data.institute, 3, 80);
  if (!institute) return { error: 'Enter a valid school or college name.' };

  var yearNow = Number(Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy'));
  var passingYear = wholeNumber_(data.passingYear, 1990, yearNow);
  if (passingYear === null) return { error: 'Enter a valid passing year.' };
  var obtained = wholeNumber_(data.obtainedMarks, 0, 10000);
  var total = wholeNumber_(data.totalMarks, 1, 10000);
  if (obtained === null || total === null || obtained > total) return { error: 'Enter valid marks.' };

  var courses = courses_(data.courses);
  if (!courses) return { error: 'Select a valid scholarship course.' };
  if (data.consent !== true || data.undertaking !== true) {
    return { error: 'Consent and undertaking are required.' };
  }

  var photo = readImage_(data.photo);
  if (photo.error) return { error: 'Photograph must be a JPG, PNG, or WEBP image.' };
  var cnicFile = readImage_(data.cnicFile);
  if (cnicFile.error) return { error: 'CNIC / B-Form must be a JPG, PNG, or WEBP image.' };
  var degreeFile = readImage_(data.degreeFile);
  if (degreeFile.error) return { error: 'Certificate must be a JPG, PNG, or WEBP image.' };

  return {
    applicationId: applicationId_(data.applicationId),
    name: name,
    fatherName: fatherName,
    dob: dob,
    cnic: cnic,
    gender: data.gender,
    mobile: String(data.mobile),
    email: email,
    address: address,
    taluka: taluka,
    district: district,
    fatherOccupation: occupation,
    fatherIncome: income,
    fatherContact: String(data.fatherContact),
    qualification: qualification,
    institute: institute,
    passingYear: passingYear,
    obtainedMarks: obtained,
    totalMarks: total,
    percentage: ((obtained / total) * 100).toFixed(2) + '%',
    courses: courses,
    photo: photo,
    cnicFile: cnicFile,
    degreeFile: degreeFile
  };
}

function scholarshipSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SCHOLARSHIP_SPREADSHEET_ID') || SCHOLARSHIP_SPREADSHEET_ID;
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      savedId = '';
    }
  }

  var active = null;
  try {
    active = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    active = null;
  }
  if (active) {
    props.setProperty('SCHOLARSHIP_SPREADSHEET_ID', active.getId());
    return active;
  }

  var created = SpreadsheetApp.create('IT Skills Hub Scholarship Applications');
  props.setProperty('SCHOLARSHIP_SPREADSHEET_ID', created.getId());
  return created;
}

function scholarshipSheet_() {
  var ss = scholarshipSpreadsheet_();
  var sheet = ss.getSheetByName('Scholarship Applications');
  if (!sheet) {
    sheet = ss.insertSheet('Scholarship Applications');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SCHOLARSHIP_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SCHOLARSHIP_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#004ea1')
      .setFontColor('#ffffff');
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(11, 220);
  }
  return sheet;
}

function scholarshipFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SCHOLARSHIP_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      id = '';
    }
  }
  var folder = DriveApp.createFolder('IT Skills Hub Scholarship Documents');
  props.setProperty('SCHOLARSHIP_FOLDER_ID', folder.getId());
  return folder;
}

function saveImage_(folder, image, applicationId, label) {
  var name = safeFileName_(applicationId + '-' + label + extensionFor_(image.mime));
  var blob = Utilities.newBlob(image.bytes);
  blob.setContentType(image.mime || 'image/jpeg');
  blob.setName(name);
  return folder.createFile(blob).getUrl();
}

function readImage_(upload) {
  if (!upload || typeof upload.data !== 'string' || upload.data.length > 2000000) {
    return { error: true };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(upload.data)) return { error: true };
  var bytes = Utilities.base64Decode(upload.data);
  if (!bytes || bytes.length < 32 || bytes.length > 1500000) return { error: true };
  var mime = imageMime_(bytes);
  if (!mime) return { error: true };
  return { bytes: bytes, mime: mime };
}

function imageMime_(bytes) {
  var b0 = unsigned_(bytes, 0);
  var b1 = unsigned_(bytes, 1);
  var b2 = unsigned_(bytes, 2);
  var b3 = unsigned_(bytes, 3);
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return 'image/png';
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 &&
      unsigned_(bytes, 8) === 0x57 && unsigned_(bytes, 9) === 0x45 &&
      unsigned_(bytes, 10) === 0x42 && unsigned_(bytes, 11) === 0x50) {
    return 'image/webp';
  }
  return '';
}

function unsigned_(bytes, index) {
  var value = bytes[index];
  return value < 0 ? value + 256 : value;
}

function letters_(value, min, max) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001F]/g, '').trim();
  if (text.length < min || text.length > max) return '';
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(text)) return '';
  return text;
}

function plain_(value, min, max) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (text.length < min || text.length > max) return '';
  if (/[<>{}`\\]/.test(text)) return '';
  return guard_(text);
}

function qualification_(value) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001F]/g, '').trim();
  var known = {
    'Middle': true,
    'Matric / SSC': true,
    'Intermediate / HSSC': true,
    'Diploma / DAE': true,
    'Bachelor': true
  };
  if (known[text]) return text;
  if (text.length < 2 || text.length > 60) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9\s\/\-.&()]*$/.test(text)) return '';
  return guard_(text);
}

function courses_(value) {
  var allowed = {
    'DIT': true,
    'One Year Advance Course': true,
    'Office Automation': true
  };
  var parts = String(value || '').split(',');
  var chosen = [];
  var seen = {};
  for (var i = 0; i < parts.length; i++) {
    var course = parts[i].replace(/[\u0000-\u001F]/g, '').trim();
    if (!course) continue;
    if (!allowed[course] || seen[course]) return '';
    seen[course] = true;
    chosen.push(course);
  }
  if (!chosen.length || chosen.length > 3) return '';
  return chosen.join(', ');
}

function date_(value) {
  var text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  var parts = text.split('-');
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  if (year < 1950) return '';
  var today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  if (text > today) return '';
  return text;
}

function wholeNumber_(value, min, max) {
  var number = value;
  if (typeof number === 'string' && /^\d+$/.test(number)) number = Number(number);
  if (typeof number !== 'number' || !isFinite(number) || Math.floor(number) !== number) return null;
  if (number < min || number > max) return null;
  return number;
}

function applicationId_(value) {
  var text = String(value || '');
  if (/^ISH-\d{8}-[A-Z2-9]{4}$/.test(text)) return text;
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'ISH-' + Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyyMMdd') + '-' + code;
}

function guard_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function cnicExists_(sheet, cnic) {
  var digits = String(cnic || '').replace(/\D/g, '');
  if (!digits || sheet.getLastRow() < 2) return false;
  var values = sheet.getRange(2, 7, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).replace(/\D/g, '') === digits) return true;
  }
  return false;
}

function extensionFor_(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

function safeFileName_(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').substring(0, 120);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
