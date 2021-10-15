const pg = require('knex')({
    client: 'pg',
    connection: process.env.DATABASE_URL
});

const bookshelf = require("bookshelf")(pg);

const TitleType = bookshelf.model("TitleType", {
    tableName: "title_types"
});

const Author = bookshelf.model("Author", {
    tableName: "authors"
});

const Tag = bookshelf.model("Tag", {
    tableName: "tags"
});

const Title = bookshelf.model("Title", {
    tableName: "titles",
    type() {
        return this.belongsTo("TitleType", "type_id");
    },
    authors() {
        return this.belongsToMany("Author", "title_authors");
    }
});

const Quote = bookshelf.model("Quote", {
    tableName: "quotes",
    title() {
        return this.belongsTo("Title");
    },
    tags() {
        return this.belongsToMany("Tag", "quote_tags");
    }
});

module.exports = {
    TitleType,
    Author,
    Title,
    Tag,
    Quote
};
