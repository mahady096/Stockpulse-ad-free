/* StockPulse Pro UI v3.1 — Modal + Email */
(function () {
  'use strict';

  // ==========================================
  // 🔧 কনফিগারেশন (আপনার তথ্য দিন)
  // ==========================================
  const ADMIN_EMAIL = 'admin.stockpulse@gmail.com'; // ← আপনার আসল ইমেইল এখানে
  const SUBJECT = 'Stockpulse Pro';

  // ==========================================
  // 📧 ইমেইল ওপেন করার ফাংশন
  // ==========================================
  function openProEmail() {
    // বর্তমান ইউজারের তথ্য নিন
    const user = window.auth?.currentUser;
    const userEmail = user?.email || '';
    const userUid = user?.uid || '';

    // ইমেইল বডি তৈরি করুন (নতুন লাইনের জন্য %0A ব্যবহার)
    const body =
      'আমার ইমেইল: ' + userEmail +
      '%0Aআমার UID: ' + userUid +
      '%0A%0Aআমি StockPulse Pro কিনতে চাই। পেমেন্টের নির্দেশনা পাঠান।';

    // mailto: লিংক তৈরি করুন
    const mailtoLink =
      'mailto:' + ADMIN_EMAIL +
      '?subject=' + encodeURIComponent(SUBJECT) +
      '&body=' + body;

    // ইমেইল ওপেন করুন
    window.location.href = mailtoLink;
  }

  // ==========================================
  // 🔥 মডাল খোলা/বন্ধ করার ফাংশন
  // ==========================================
  function openUpgradeModal() {
    const modal = document.getElementById('sp-upgrade-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  function closeUpgradeModal() {
    const modal = document.getElementById('sp-upgrade-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // ==========================================
  // 🔥 DOMContentLoaded — ইভেন্ট লিসেনার
  // ==========================================
  function init() {
    // ১. ইউজার মেনুর "Upgrade to Pro" বাটন → মডাল খুলবে
    const upgradeBtn = document.getElementById('sp-upgrade-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openUpgradeModal();
      });
    }

    // ২. মডালের ভেতরের "Send Mail" বাটন → ইমেইল ওপেন হবে
    const sendMailBtn = document.querySelector('.sp-upgrade-send-mail');
    if (sendMailBtn) {
      sendMailBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openProEmail();
      });
    }

    // ৩. মডাল বন্ধ করার বাটন (×)
    const closeBtn = document.querySelector('.sp-upgrade-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeUpgradeModal();
      });
    }

    // ৪. মডালের বাইরে ক্লিক করলে বন্ধ
    const upgradeModal = document.getElementById('sp-upgrade-modal');
    if (upgradeModal) {
      upgradeModal.addEventListener('click', function (e) {
        if (e.target === upgradeModal) {
          closeUpgradeModal();
        }
      });
    }

    // ৫. "Get Pro" বাটন (পুরনো) — এটিও ইমেইল ওপেন করবে
    const oldGetProBtn = document.querySelector('.sp-upgrade-main');
    if (oldGetProBtn) {
      oldGetProBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openProEmail();
      });
    }
  }

  // DOMContentLoaded ইভেন্টে init() কল করুন
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ==========================================
  // 🌐 গ্লোবালি এক্সপোজ
  // ==========================================
  window.openProEmail = openProEmail;
  window.openUpgradeModal = openUpgradeModal;
  window.closeUpgradeModal = closeUpgradeModal;
})();