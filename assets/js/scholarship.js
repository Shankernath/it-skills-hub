/**
 * Paste the Google Apps Script web app URL below after deploying
 * google-apps-script/Code.gs (the URL ends with /exec).
 */
const SCHOLARSHIP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwL4ghxAU7lyA7lPCWHI1T31MoIPi1T2YRRV8b4BgBicPJKEYpC5d6x04WJdBw4icsY/exec';

const DRAFT_KEY = 'ish_scholarship_draft';
const COOLDOWN_KEY = 'ish_scholarship_submit';

const form = document.getElementById('scholarshipForm');
const statusBox = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');
const percentagePreview = document.getElementById('percentagePreview');
const statusHome = statusBox.parentElement;

const TEXT_FIELDS = [
  'name', 'fatherName', 'dob', 'cnic', 'gender', 'mobile', 'email', 'address',
  'taluka', 'district', 'fatherOccupation', 'fatherIncome', 'fatherContact',
  'qualification', 'qualificationOther', 'institute', 'passingYear',
  'obtainedMarks', 'totalMarks'
];

document.getElementById('cnic').addEventListener('input', (event) => {
  event.target.value = formatCnic(event.target.value);
});

['mobile', 'fatherContact'].forEach((name) => {
  document.querySelector(`[name="${name}"]`).addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 11);
  });
});

['name', 'fatherName'].forEach((name) => {
  document.querySelector(`[name="${name}"]`).addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/[^a-zA-Z\s]/g, '').slice(0, 60);
  });
});

document.getElementById('qualification').addEventListener('change', toggleOtherQualification);
['obtainedMarks', 'totalMarks'].forEach((name) => {
  document.querySelector(`[name="${name}"]`).addEventListener('input', updatePercentage);
});

document.querySelectorAll('.upload-card input[type="file"]').forEach((input) => {
  input.addEventListener('change', () => {
    showSelectedFile(input);
    saveDraft();
  });
});

form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);

form.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.addEventListener('keydown', (event) => {
  const key = (event.key || '').toUpperCase();
  const inspectKey = key === 'F12' || event.keyCode === 123;
  const inspectChord = (event.ctrlKey || event.metaKey) && event.shiftKey && ['I', 'J', 'C'].includes(key);
  const viewSource = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'U';
  if (inspectKey || inspectChord || viewSource) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitApplication();
});

document.querySelectorAll('.navbar-nav .nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if (navbarCollapse.classList.contains('show')) {
      bootstrap.Collapse.getOrCreateInstance(navbarCollapse).hide();
    }
  });
});

document.getElementById('dob').max = todayIso();
document.getElementById('passingYear').max = String(new Date().getFullYear());

restoreDraft();
toggleOtherQualification();
updatePercentage();

function validateForm() {
  for (let step = 1; step <= 5; step += 1) {
    const message = stepError(step);
    if (message) {
      showStatus(message, 'danger', document.querySelector(`.form-step[data-step="${step}"]`));
      return false;
    }
  }
  clearStatus();
  return true;
}

function stepError(step) {
  const data = readForm();
  let message = '';

  if (step === 1) {
    if (data.name.trim().length < 3) message = 'Enter the applicant name (at least 3 letters).';
    else if (data.fatherName.trim().length < 3) message = "Enter the father's name (at least 3 letters).";
    else if (!data.dob || data.dob > todayIso()) message = 'Enter a valid date of birth.';
    else if (data.cnic.replace(/\D/g, '').length !== 13) message = 'Enter a 13-digit CNIC or B-Form number.';
    else if (!data.gender) message = 'Select gender.';
    else if (!/^03\d{9}$/.test(data.mobile)) message = 'Enter an 11-digit mobile number starting with 03.';
    else if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) message = 'Enter a valid email address, or leave it blank.';
    else if (data.address.trim().length < 10) message = 'Enter the full resident address.';
    else if (data.taluka.trim().length < 2) message = 'Enter the taluka.';
    else if (data.district.trim().length < 2) message = 'Enter the district.';
    else if (data.fatherOccupation.trim().length < 2) message = "Enter the father's occupation.";
    else if (data.name.trim().length > 60) message = 'Name cannot be longer than 60 characters.';
    else if (data.fatherName.trim().length > 60) message = "Father's name cannot be longer than 60 characters.";
    else if (data.email.length > 80) message = 'Email cannot be longer than 80 characters.';
    else if (data.address.trim().length > 250) message = 'Address cannot be longer than 250 characters.';
    else if (data.taluka.trim().length > 40) message = 'Taluka cannot be longer than 40 characters.';
    else if (data.district.trim().length > 40) message = 'District cannot be longer than 40 characters.';
    else if (data.fatherOccupation.trim().length > 60) message = "Father's occupation cannot be longer than 60 characters.";
    else if (data.fatherIncome === '' || Number(data.fatherIncome) < 0) message = "Enter the father's monthly income in PKR.";
    else if (Number(data.fatherIncome) > 99999999) message = 'Monthly income is too large. Enter the amount in PKR, up to 8 digits.';
    else if (!/^03\d{9}$/.test(data.fatherContact)) message = "Enter the father's 11-digit contact number starting with 03.";
    return message;
  }

  if (step === 2) {
    const qualification = finalQualification(data);
    const year = Number(data.passingYear);
    const obtained = Number(data.obtainedMarks);
    const total = Number(data.totalMarks);
    if (data.qualification === 'Other' && !data.qualificationOther.trim()) message = 'Please specify your qualification.';
    else if (data.qualificationOther.trim().length > 60) message = 'Qualification cannot be longer than 60 characters.';
    else if (!qualification) message = 'Select the last qualification.';
    else if (data.institute.trim().length < 3) message = 'Enter the school or college name.';
    else if (data.institute.trim().length > 80) message = 'School or college name cannot be longer than 80 characters.';
    else if (!year || year < 1990 || year > new Date().getFullYear()) message = 'Enter a valid passing year.';
    else if (data.obtainedMarks === '' || !Number.isInteger(obtained) || obtained < 0) message = 'Enter the marks obtained.';
    else if (obtained > 10000) message = 'Obtained marks cannot be more than 10,000.';
    else if (!Number.isInteger(total) || total <= 0) message = 'Enter the total marks.';
    else if (total > 10000) message = 'Total marks cannot be more than 10,000.';
    else if (obtained > total) message = 'Obtained marks cannot be more than total marks.';
    return message;
  }

  if (step === 3 && selectedCourses().length === 0) {
    return 'Select at least one scholarship course.';
  }

  if (step === 4) {
    const photo = document.getElementById('photo').files[0];
    const cnicFile = document.getElementById('cnicFile').files[0];
    const degreeFile = document.getElementById('degreeFile').files[0];
    if (!photo) message = 'Upload a photograph.';
    else if (!isImage(photo)) message = 'Photograph must be a JPG, PNG, or WEBP image.';
    else if (!cnicFile) message = 'Upload the CNIC or B-Form.';
    else if (!isImage(cnicFile)) message = 'CNIC / B-Form must be a JPG, PNG, or WEBP image.';
    else if (!degreeFile) message = 'Upload the last degree or certificate.';
    else if (!isImage(degreeFile)) message = 'The certificate must be a JPG, PNG, or WEBP image.';
    return message;
  }

  if (step === 5) {
    if (!document.getElementById('consent').checked) return 'Please agree to the consent before submitting.';
    if (!document.getElementById('undertaking').checked) return 'Please accept the undertaking before submitting.';
  }

  return '';
}

async function submitApplication() {
  if (!validateForm()) return;

  const lastSubmit = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
  const waitMs = 60000 - (Date.now() - lastSubmit);
  if (lastSubmit && waitMs > 0) {
    showStatus(`Please wait ${Math.ceil(waitMs / 1000)} seconds before submitting again.`, 'danger');
    return;
  }

  if (document.querySelector('[name="website_url"]').value) return;

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(SCHOLARSHIP_SCRIPT_URL)) {
    showStatus('Scholarship applications are temporarily unavailable online. Please call or WhatsApp 0349-0304228.', 'danger');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';

  try {
    const data = readForm();
    const applicationId = createApplicationId();
    const payload = {
      formType: 'scholarship',
      applicationId,
      name: data.name.trim(),
      fatherName: data.fatherName.trim(),
      dob: data.dob,
      cnic: formatCnic(data.cnic),
      gender: data.gender,
      mobile: data.mobile,
      email: data.email.trim(),
      address: data.address.trim(),
      taluka: data.taluka.trim(),
      district: data.district.trim(),
      fatherOccupation: data.fatherOccupation.trim(),
      fatherIncome: Number(data.fatherIncome),
      fatherContact: data.fatherContact,
      qualification: finalQualification(data),
      institute: data.institute.trim(),
      passingYear: Number(data.passingYear),
      obtainedMarks: Number(data.obtainedMarks),
      totalMarks: Number(data.totalMarks),
      percentage: percentageText(),
      courses: selectedCourses().join(', '),
      consent: true,
      undertaking: true,
      photo: await filePayload(document.getElementById('photo').files[0]),
      cnicFile: await filePayload(document.getElementById('cnicFile').files[0]),
      degreeFile: await filePayload(document.getElementById('degreeFile').files[0])
    };

    const response = await fetch(SCHOLARSHIP_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result || result.ok !== true) {
      throw new Error((result && result.error) || 'The application was rejected. Please check your details.');
    }

    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    sessionStorage.removeItem(DRAFT_KEY);
    showSuccess(result.applicationId || applicationId);
  } catch (error) {
    showStatus(error.message || 'Could not submit the application. Please try again, or contact 0349-0304228.', 'danger');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Submit Application';
  }
}

function showSuccess(applicationId) {
  form.querySelectorAll('.form-step').forEach((panel) => panel.classList.add('d-none'));
  form.querySelector('.wizard-actions').classList.add('d-none');
  clearStatus();
  document.getElementById('successPanel').classList.remove('d-none');
  document.getElementById('successId').textContent = applicationId;
}

function readForm() {
  const data = {};
  TEXT_FIELDS.forEach((name) => {
    const field = form.elements[name];
    data[name] = field ? field.value : '';
  });
  data.gender = (form.querySelector('[name="gender"]:checked') || {}).value || '';
  return data;
}

function selectedCourses() {
  return Array.from(form.querySelectorAll('[name="courses"]:checked')).map((input) => input.value);
}

function finalQualification(data) {
  if (data.qualification === 'Other') return data.qualificationOther.trim();
  return data.qualification;
}

function toggleOtherQualification() {
  const isOther = document.getElementById('qualification').value === 'Other';
  document.getElementById('otherQualificationWrap').classList.toggle('d-none', !isOther);
}

function updatePercentage() {
  const text = percentageText();
  percentagePreview.classList.toggle('d-none', !text);
  percentagePreview.textContent = text ? `Percentage: ${text}` : '';
}

function percentageText() {
  const obtained = Number(document.querySelector('[name="obtainedMarks"]').value);
  const total = Number(document.querySelector('[name="totalMarks"]').value);
  if (!total || obtained < 0 || obtained > total) return '';
  return `${((obtained / total) * 100).toFixed(2)}%`;
}

function showSelectedFile(input) {
  const card = input.closest('.upload-card');
  const state = card.querySelector('.file-state');
  const existing = card.querySelector('img.preview');
  if (existing) existing.remove();
  const file = input.files[0];
  if (!file) {
    card.classList.remove('ready');
    state.textContent = 'No file selected';
    return;
  }
  if (!isImage(file)) {
    input.value = '';
    card.classList.remove('ready');
    state.textContent = 'No file selected';
    showStatus('Only JPG, PNG, or WEBP images are allowed.', 'danger');
    return;
  }
  card.classList.add('ready');
  state.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
  if (isImage(file)) {
    const img = document.createElement('img');
    img.className = 'preview';
    img.alt = '';
    img.src = URL.createObjectURL(file);
    card.appendChild(img);
  }
}

async function filePayload(file) {
  if (!isImage(file)) throw new Error('Only JPG, PNG, or WEBP images are allowed.');
  return compressImage(file);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const maxEdge = 1200;
      let width = image.width;
      let height = image.height;
      const scale = Math.min(1, maxEdge / width, maxEdge / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not prepare the photograph.'));
          return;
        }
        if (blob.size > 900 * 1024) {
          reject(new Error('That image is still too large. Please choose a smaller photo.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name.replace(/\.\w+$/, '') + '.jpg',
          mime: 'image/jpeg',
          data: String(reader.result).split(',')[1]
        });
        reader.onerror = () => reject(new Error('Could not read the image.'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.72);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not open that image. Please use JPG or PNG.'));
    };
    image.src = url;
  });
}

function saveDraft() {
  const draft = readForm();
  draft.courses = selectedCourses();
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    TEXT_FIELDS.forEach((name) => {
      if (draft[name] && form.elements[name] && name !== 'gender') form.elements[name].value = draft[name];
    });
    if (draft.gender) {
      const gender = form.querySelector(`[name="gender"][value="${draft.gender}"]`);
      if (gender) gender.checked = true;
    }
    (draft.courses || []).forEach((course) => {
      const box = form.querySelector(`[name="courses"][value="${CSS.escape(course)}"]`);
      if (box) box.checked = true;
    });
  } catch (error) {
    sessionStorage.removeItem(DRAFT_KEY);
  }
}

function formatCnic(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function createApplicationId() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return `ISH-${date}-${code}`;
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isImage(file) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

function showStatus(message, type, section) {
  statusBox.className = `alert alert-${type}`;
  statusBox.textContent = message;
  statusBox.classList.remove('d-none');
  if (section) section.prepend(statusBox);
  else statusHome.prepend(statusBox);
  const offset = (document.querySelector('.fixed-top')?.offsetHeight || 0) + 12;
  const top = statusBox.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

function clearStatus() {
  statusBox.classList.add('d-none');
  statusBox.textContent = '';
  statusHome.prepend(statusBox);
}
