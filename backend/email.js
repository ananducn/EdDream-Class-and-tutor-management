import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordReset(toEmail, resetLink) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: toEmail,
      subject: 'Reset your password',
      html: `
        <p>You requested a password reset for your Class Management account.</p>
        <p><a href="${resetLink}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    return null;
  }
}

export async function sendStaffInvite(toEmail, name, inviteLink) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: toEmail,
      subject: "You've been invited to Class Management System",
      html: `
        <p>Hi ${name},</p>
        <p>You have been added to the Class Management System.</p>
        <p><a href="${inviteLink}">Accept Invite</a> to set up your account.</p>
        <p>This link expires in 48 hours.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send staff invite email:', err);
    return null;
  }
}
