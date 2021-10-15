const express = require('express');
const app = express();

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

global.db = require("./db/main.js");

const quotes = require("./models/quote.js");
const titles = require("./models/title.js");

app.get('/', (req, res) => {
    res.send("Landing page...");
});

app.get("/quotes/:id", quotes.findQuoteById);

app.get("/titles/:id", titles.findTitleById);

app.listen(process.env.PORT, () => {
  console.log(`Example app listening at http://localhost:${process.env.PORT}`);
});

/*
    getQuoteWithAllAttributes, 
    joinTitleWithAuthors,
    getRecentlyAddedQuotes,
    getAllQuotes,
    getFavouriteQuotes,
    getQuotesInTitle,
    getAllTitlesAndAuthors,
    getAllTitles,
    getAllAuthors,
    getAllTitleTypes,
    getAllTags,
    updateQuote,
    deleteQuote,
    createQuote
*/