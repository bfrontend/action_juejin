const nodemailer = require('nodemailer');

const sendMail = async (data) => {
  let transporter = nodemailer.createTransport({
    host: 'smtp.163.com',
    port: '25',
    secureConnection: true,
    auth: {
      user: process.env.user,
      pass: process.env.pass
    }
  });

  data.from = `"${data.from}" ${process.env.user}`;

  await transporter.sendMail(data);
};

module.exports = sendMail;
