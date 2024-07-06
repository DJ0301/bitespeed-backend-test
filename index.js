const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();

// Setup PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'identity_db',
  password: '1003',
  port: 5432,
});

app.use(bodyParser.json());

app.post('/identify', async (req, res) => {
  const { email, phoneNumber } = req.body;
//check for primary contact
  try {
    const primaryContactQuery = {
      text: `
        SELECT * FROM contact
        WHERE (email = $1 OR $1 IS NULL) AND (phone_number = $2 OR $2 IS NULL)
        AND link_precedence = 'primary'
        LIMIT 1
      `,
      values: [email, phoneNumber],
    };

    let primaryContactResult = await pool.query(primaryContactQuery);
    let primaryContact = primaryContactResult.rows[0];

    // If no primary contact found, create a new one
    if (!primaryContact) {
      const insertQuery = {
        text: `
          INSERT INTO contact (phone_number, email, link_precedence)
          VALUES ($1, $2, 'primary')
          RETURNING id
        `,
        values: [phoneNumber || null, email || null],
      };

      const insertResult = await pool.query(insertQuery);
      primaryContact = { id: insertResult.rows[0].id, email, phoneNumber };
    }

    // Check for secondary contacts
    const secondaryContactQuery = {
      text: `
        SELECT id FROM contact
        WHERE (email = $1 OR $1 IS NULL) AND (phone_number = $2 OR $2 IS NULL)
        AND link_precedence = 'secondary'
      `,
      values: [email, phoneNumber],
    };

    let secondaryContactResult = await pool.query(secondaryContactQuery);
    const secondaryContactIds = secondaryContactResult.rows.map(contact => contact.id);

    const response = {
      contact: {
        primaryContactId: primaryContact.id,
        emails: [primaryContact.email, ...(email ? [email] : [])].filter(Boolean),
        phoneNumbers: [primaryContact.phoneNumber, ...(phoneNumber ? [phoneNumber] : [])].filter(Boolean),
        secondaryContactIds,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error identifying contact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
