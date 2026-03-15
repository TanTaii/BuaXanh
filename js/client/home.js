/**
 * Logic Trang Chủ (Home Page)
 * Xử lý: Slider, Đồng hồ đếm ngược Flash Sale (Persistent)
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. Đồng hồ đếm ngược Flash Sale (Lưu trạng thái) ---
  const hoursElement = document.getElementById('hours');
  const minutesElement = document.getElementById('minutes');
  const secondsElement = document.getElementById('seconds');

  if (hoursElement && minutesElement && secondsElement) {
    // Cấu hình thời gian đếm ngược (ví dụ: 2 giờ 45 phút 30 giây)
    const COUNTDOWN_DURATION_MS = (2 * 3600 + 45 * 60 + 30) * 1000;
    
    // Lấy thời gian kết thúc từ LocalStorage
    let targetEndTime = localStorage.getItem('flashSaleEndTime');

    // Nếu chưa có hoặc đã hết hạn, thiết lập mốc thời gian mới
    if (!targetEndTime || new Date().getTime() > parseInt(targetEndTime)) {
      targetEndTime = new Date().getTime() + COUNTDOWN_DURATION_MS;
      localStorage.setItem('flashSaleEndTime', targetEndTime);
    } else {
      targetEndTime = parseInt(targetEndTime);
    }

    function updateCountdown() {
      const now = new Date().getTime();
      let distance = targetEndTime - now;

      // Nếu hết giờ, reset lại chu kỳ mới (tùy chọn)
      if (distance < 0) {
        targetEndTime = new Date().getTime() + COUNTDOWN_DURATION_MS;
        localStorage.setItem('flashSaleEndTime', targetEndTime);
        distance = COUNTDOWN_DURATION_MS;
      }

      // Tính toán giờ, phút, giây
      const h = Math.floor(distance / (1000 * 60 * 60));
      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((distance % (1000 * 60)) / 1000);

      // Hiển thị (thêm số 0 phía trước nếu < 10)
      hoursElement.innerText = h < 10 ? '0' + h : h;
      minutesElement.innerText = m < 10 ? '0' + m : m;
      secondsElement.innerText = s < 10 ? '0' + s : s;
    }

    // Cập nhật ngay lập tức và mỗi giây
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // --- 2. Hero Slider (Slider chính) ---
  const sliderContainer = document.querySelector('.slider-container');
  const slides = document.querySelectorAll('.slide');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const dots = document.querySelectorAll('#slider-dots .dot');

  if (sliderContainer && slides.length > 0) {
    let currentSlide = 0;
    const slideCount = slides.length;
    let autoSlideInterval;

    // Cập nhật giao diện slider
    function updateSlider() {
      sliderContainer.style.transform = `translateX(-${currentSlide * 100}%)`;

      slides.forEach((slide, index) => {
        if (index === currentSlide) {
          slide.classList.add('active');
        } else {
          slide.classList.remove('active');
        }
      });

      // Cập nhật dots navigation
      dots.forEach((dot, index) => {
        if (index === currentSlide) {
          dot.classList.add('active', 'bg-white/100');
          dot.classList.remove('bg-white/30');
        } else {
          dot.classList.remove('active', 'bg-white/100');
          dot.classList.add('bg-white/30');
        }
      });
    }

    // Chuyển slide kế tiếp
    function nextSlide() {
      currentSlide = (currentSlide + 1) % slideCount;
      updateSlider();
    }

    // Quay lại slide trước
    function prevSlide() {
      currentSlide = (currentSlide - 1 + slideCount) % slideCount;
      updateSlider();
    }

    // Tự động chuyển slide
    function startAutoSlide() {
      stopAutoSlide(); // Clear cũ để tránh chồng chéo
      autoSlideInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoSlide() {
      if (autoSlideInterval) clearInterval(autoSlideInterval);
    }

    // Event Listeners cho nút điều hướng
    if (nextBtn) nextBtn.addEventListener('click', () => {
      nextSlide();
      startAutoSlide(); // Reset timer khi người dùng tương tác
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
      prevSlide();
      startAutoSlide();
    });

    // Event Listeners cho dots
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        currentSlide = parseInt(dot.getAttribute('data-index'));
        updateSlider();
        startAutoSlide();
      });
    });

    // Khởi chạy slider
    updateSlider();
    startAutoSlide();
  }
});

