const express = require('express');
const app = express();

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

global.db = require("./db/main.js");

const quotes = require("./models/quote.js");
const titles = require("./models/title.js");
const authors = require("./models/author.js");
const tags = require("./models/tag.js");
const types = require("./models/type.js");

app.get('/', (req, res) => {
    res.send("Landing page...");
});

app.get("/quotes/:id", quotes.findQuoteById);
app.get("/quotes", quotes.getQuotes);

app.get("/titles/:id", titles.findTitleById);
app.get("/titles", titles.getTitles);

app.get("/authors", authors.getAuthors)

app.get("/tags", tags.getTags);

app.get("/types", types.getTypes);

app.listen(process.env.PORT, () => {
  console.log(`Example app listening at http://localhost:${process.env.PORT}`);
});

/*
    updateQuote,
    deleteQuote,
    createQuote

    findQuoteById               --> /quotes/:id
    findTitleById               --> /titles/:id
    getQuoteWithAllAttributes   --> /quotes?full=true
    joinTitleWithAuthors        --> /titles/:id?full=true
    getRecentlyAddedQuotes      --> /quotes?recent=true
    getAllQuotes                --> /quotes
    getFavouriteQuotes          --> /quotes?favourite=true
    getQuotesInTitle            --> /quotes?titleId=X
    getAllTitlesAndAuthors      --> /titles?full=true
    getAllTitles                --> /titles
    getAllAuthors               --> /authors
    getAllTitleTypes            --> /types
    getAllTags                  --> /tags
*/