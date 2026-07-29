    function attachContactFormListener() {
        const form = document.querySelector('.contact-form');

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();

                const name = form.querySelector('input[name="name"]').value;
                const email = form.querySelector('input[name="email"]').value;
                const phone = form.querySelector('input[name="phone"]').value;
                const message = form.querySelector('textarea[name="message"]').value;

                const formData = { name, email, phone, message };
                localStorage.setItem('contactFormData', JSON.stringify(formData));

                const encodedMessage = message.replace(/\n/g, '%0D%0A');
                const encodedName = encodeURIComponent(name);
                const encodedPhone = encodeURIComponent(phone);
                const encodedEmail = encodeURIComponent(email);

                const emailBody = `${encodedMessage}%0D%0A%0D%0A${encodedName}%0D%0A${encodedPhone}%0D%0A${encodedEmail}`;
                const subject = `Contact Request from ${encodedName}`;

                window.location.href = `mailto:support@example.com?subject=${subject}&body=${emailBody}`;
            });
        }
    }

    function attachEmailCopyListener() {
        const emailText = document.querySelector('.email-text');

        if (emailText) {
            emailText.addEventListener('click', function () {
                copyToClipboard(emailText.textContent);

                emailText.textContent = 'Email Copied to Clipboard.';
                emailText.style.color = 'green';

                setTimeout(() => {
                    emailText.textContent = 'support@example.com';
                    emailText.style.color = '';
                }, 2000);
            });
        }
    }

    function copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    // Attach the listeners when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function () {
        attachContactFormListener();
        attachEmailCopyListener();
    });
