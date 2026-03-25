/* ============================================================
   冷杉 Cedar — 主要 JavaScript
   ============================================================ */

/* ── Mobile Nav ── */
(function () {
  const hamburger = document.querySelector('.nav__hamburger');
  const mobileNav = document.querySelector('.nav__mobile');
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Close on link click
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => mobileNav.classList.remove('open'));
  });
})();

/* ── Active nav link ── */
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a, .nav__mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href && href.includes(path)) a.classList.add('active');
  });
})();

/* ── Fade-in on scroll ── */
(function () {
  const els = document.querySelectorAll('.fade-in');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => observer.observe(el));
})();

/* ── FAQ Accordion ── */
(function () {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      // Close all
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));

      // Toggle current
      if (!isOpen) item.classList.add('open');
    });
  });
})();

/* ── Taiwan Tax ID (統編) Validation ── */
function validateTaxId(id) {
  if (!/^\d{8}$/.test(id)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let n = parseInt(id[i]) * weights[i];
    sum += Math.floor(n / 10) + (n % 10);
  }
  return sum % 10 === 0 || (id[6] === '7' && (sum + 1) % 10 === 0);
}

/* ── Contact Form (Formspree) ── */
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn = form.querySelector('.form-submit');
  const thankYou = document.getElementById('thank-you');

  function showError(fieldId, msg) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(fieldId + '-error');
    if (field) field.classList.add('error');
    if (error) { error.textContent = msg; error.classList.add('visible'); }
  }

  function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(fieldId + '-error');
    if (field) field.classList.remove('error');
    if (error) error.classList.remove('visible');
  }

  // Clear on input
  form.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => clearError(input.id));
    input.addEventListener('blur', () => {
      if (input.id === 'tax-id' && input.value) {
        if (!validateTaxId(input.value)) {
          showError('tax-id', '請填寫有效的統一編號（8 位數字）');
        }
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;

    // Validate company
    const company = document.getElementById('company').value.trim();
    if (!company) { showError('company', '請填寫公司名稱'); valid = false; }

    // Validate tax ID
    const taxId = document.getElementById('tax-id').value.trim();
    if (!taxId) {
      showError('tax-id', '請填寫統一編號'); valid = false;
    } else if (!validateTaxId(taxId)) {
      showError('tax-id', '請填寫有效的統一編號（8 位數字）'); valid = false;
    }

    // Validate name
    const name = document.getElementById('name').value.trim();
    if (!name) { showError('name', '請填寫您的姓名'); valid = false; }

    if (!valid) {
      form.querySelector('.form-input.error')?.focus();
      return;
    }

    // Submit
    submitBtn.disabled = true;
    submitBtn.textContent = '送出中…';

    try {
      const data = new FormData(form);
      const res = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        form.style.display = 'none';
        if (thankYou) thankYou.classList.add('visible');
        window.scrollTo({ top: thankYou.offsetTop - 80, behavior: 'smooth' });
      } else {
        throw new Error('Server error');
      }
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = '送出預約申請';
      alert('送出失敗，請稍後再試，或直接寄信至 service@cedar.com.tw');
    }
  });
})();
