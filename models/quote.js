const NUM_RECENT_QUOTES = 5;

const findQuoteById = (req, res) => {
    if(req.query) {
        if(req.query.full)
            return getQuoteWithAllAttributes(req, res);
    }

    new db.Quote({ id: req.params.id }).fetch({ require: false })
    .then(quote => {
        res.send(quote ? quote.toJSON() : null);
    });
};

const getQuoteWithAllAttributes = (req, res) => {
    let returnQuote = {};

    new db.Quote({ id: req.params.id }).fetch({ require: false, withRelated: [ "title", "authors", "tags" ] })
    .then(quote => {
        if(quote == null)  {
            returnQuote = null;
            return new Promise(resolve => resolve(null));
        }

        quote = quote.toJSON();
        returnQuote = quote;
        console.log("Quote before title fetch", quote);
        
        if(quote.title) {
            let relatedAttrs = [ "type" ];

            if(quote.authors.length == 0)
                relatedAttrs.push("authors"); //the quote does not have author relationships, but maybe its title does
            
            return new db.Title({ id: quote.title.id })
                    .fetch({ require: false, withRelated: relatedAttrs });
        } else {
            return new Promise(resolve => resolve(null));
        }
    })
    .then(titleWithTypeAndAuthors => {
        if(titleWithTypeAndAuthors) {
            titleWithTypeAndAuthors = titleWithTypeAndAuthors.toJSON();
            returnQuote.title.type = titleWithTypeAndAuthors.type;
            returnQuote.authors = returnQuote.authors.length == 0 ? titleWithTypeAndAuthors.authors : returnQuote.authors;
        }
        else {
            returnQuote.title = null;
        }
            
        res.send(returnQuote);
    })
    .catch(error => {
        console.log("ERROR", error);
        res.send(error);
    })
};

const getQuotes = (req, res) => {
    let getQuotesPromise;

    if(req.query.recent)
        getQuotesPromise = new db.Quotes()
            .orderBy("date_added", "DESC")
            .query(qb => qb.limit(NUM_RECENT_QUOTES))
            .fetch();
        
    else if(req.query.favourite)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ is_favourite: true }))
            .fetch();
    
    else if(req.query.titleId)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ title_id: req.query.titleId }))
            .fetch();

    else
        getQuotesPromise = new db.Quotes().fetch();

    getQuotesPromise
    .then(quotes => res.send(quotes.toJSON()))
    .catch(error => {
        console.log("ERROR", error);
        res.send(error);
    });
};

const updateQuote = (req, res) => {
    let updates = {};

    if("is_favourite" in req.body)
        updates.is_favourite = req.body.is_favourite;
    else {
        console.log("No updates");
        return res.send(null);
    }

    new db.Quote({ id: req.params.id }).save(updates)
    .then(updatedModel => res.send(updatedModel.toJSON()))
    .catch(error => {
        console.log("ERROR", error);
        res.send(error)
    });
};

const deleteQuote = (req, res) => {
    //delete quote-tags
    //search for zombie tags and delete
    //delete quote-authors
    //delete quote
    //is this title a zombie title? delete corresponding title-author entries
    //then delete zombie title
    //search for zombie authors and delete

    let quoteToBeDeleted;
    let returnObj = {
        success: true,
        lastQuoteInTitle: false
    };

    new db.Quote({ id: req.params.id }).fetch()
    .then(obj => {
        quoteToBeDeleted = obj.toJSON()
        console.log("Quote to be deleted", quoteToBeDeleted);
    })
    .then(() => {
        return bookshelf.transaction(t => {
            return new db.QuoteTag()
            .where({ quote_id: req.params.id })
            .destroy({ transacting: t, require: false })
            .then(() => {
                console.log("Quote-tag associations deleted");
                return knex.raw( "SELECT tag_id from quote_tags " +
                    "WHERE tag_id IN (" +
                        "SELECT quote_tags.tag_id " +
                        "FROM tags LEFT JOIN quote_tags " +
                        "ON tags.id = quote_tags.tag_id " +
                        "GROUP BY quote_tags.tag_id " +
                        "HAVING COUNT(quote_tags.tag_id) = 1" +
                    ") AND quote_id = ?;", [ req.params.id ]
                );
            })
            .then(quotelessTags => {
                quotelessTags = quotelessTags.rows;
                console.log("Delete these quoteless tags", quotelessTags)

                if(quotelessTags.length == 0)
                    return new Promise(resolve => resolve(null));

                quotelessTags = quotelessTags.map(tag =>
                    new db.Tag()
                    .where({ id: tag.tag_id })
                    .destroy({ transacting: t })
                );

                return Promise.all(quotelessTags);
            })
            .then(() => {
                console.log("Delete quote-author relationships");
                return new db.QuoteAuthor()
                    .where({ quote_id: req.params.id })
                    .destroy({ transacting: t, require: false });
            })
            .then(() => {
                console.log("Delete quote");
                return new db.Quote()
                    .where({ id: req.params.id })
                    .destroy({ transacting: t });
            })
            .then(() => {
                if(quoteToBeDeleted.title_id) { //if the quote belonged title
                    console.log("Count how many quotes are left in the title");
                    return new db.Quote()
                        .where({ title_id: quoteToBeDeleted.title_id })
                    .count("id")
                    .then(numQuotesInTitle => {
                        console.log(`Number of quotes in title ${quoteToBeDeleted.title_id}`, numQuotesInTitle);
        
                        if(numQuotesInTitle == 1) { //the deleted quote was the last one in the title
                            returnObj.lastQuoteInTitle = true;
        
                            return new db.TitleAuthor()
                                .where({ title_id: quoteToBeDeleted.title_id })
                                .destroy({ transacting: t, require: false });
                        } else { //there are still other quotes in the title, so don't delete anything title-related
                            return new Promise(resolve => resolve(null));
                        }
                    });
                } else { //the quote didn't belong to a title, so we move on
                    return new Promise(resolve => resolve(null));
                }
            })
            .then(mustDeleteTitle => {
                if(mustDeleteTitle) {
                    console.log("Title-author relationships deleted; next - delete title");
                    return new db.Title()
                        .where({ id: quoteToBeDeleted.title_id })
                        .destroy({ transacting: t });
                }

                return new Promise(resolve => resolve(null));
            })
            .then(titleDeleted => {
                console.log(`${titleDeleted ? "Title deleted. " : ""}Count the number of titleless or quoteless authors`);

                let enquireAboutEmptyAuthorsBasedOnTitle = "";
                if(titleDeleted) { //get all the authors of the title which was deleted 
                    enquireAboutEmptyAuthorsBasedOnTitle += ("SELECT author_id " +
                        "FROM title_authors " +
                        `WHERE title_id = ${ parseInt(quoteToBeDeleted.title_id) } ` +
                        
                        "UNION ALL ");
                }
                
                /*  Maybe the authors weren't attached to the title though; maybe they were attached to the quote
                    In which case, also get all the authors that were attached to the quote deleted
                    Next, make a list of all authors in db + num items they are still attached to (be it a title or a quote)
                    and filter that list to those authors who only have 1 item left attached to them
                    If the deleted quote/title's author is on this list, it means that the deleted quote/title
                    was the only thing left attached to them, so they are now zombie authors */

                let sqlstr = "SELECT DISTINCT author_id FROM (" +
                    enquireAboutEmptyAuthorsBasedOnTitle +
                    "SELECT author_id " +
                    "FROM quote_authors " +
                    `WHERE quote_id = ${req.params.id} ` +
                ") AS authors_on_trial WHERE author_id IN " +
                    "(SELECT author_id FROM " +
                        "(   SELECT title_id as item_id, author_id " +
                            "FROM title_authors " +
                            "UNION ALL " +
                            "SELECT quote_id as item_id, author_id " +
                            "FROM quote_authors" +
                        ") AS item_ids_per_author " +
                    "GROUP BY author_id " +
                    "HAVING COUNT(item_id) = 1" +
                ");"
                console.log(sqlstr);
                //throw "Let's see...";
                return knex.raw( "SELECT DISTINCT author_id FROM (" +
                        enquireAboutEmptyAuthorsBasedOnTitle +
                        "SELECT author_id " +
                        "FROM quote_authors " +
                        "WHERE quote_id = ? " +
                    ") AS authors_on_trial WHERE author_id IN " +
                        "(SELECT author_id FROM " +
                            "(   SELECT title_id as item_id, author_id " +
                                "FROM title_authors " +
                                "UNION ALL " +
                                "SELECT quote_id as item_id, author_id " +
                                "FROM quote_authors" +
                            ") AS item_ids_per_author " +
                        "GROUP BY author_id " +
                        "HAVING COUNT(item_id) = 1" +
                    ");", [ req.params.id ]
                );
            })
            .then((titlelessAuthors) => {
                titlelessAuthors = titlelessAuthors.rows;
                console.log(`Delete ${ titlelessAuthors.length } titlelessAuthors`);
                console.log(titlelessAuthors);

                if(titlelessAuthors.length > 0) {
                    titlelessAuthors = titlelessAuthors.map(author =>
                        new db.Author()
                        .where({ id: author.author_id })
                        .destroy({ transacting: t })
                    );

                    return Promise.all(titlelessAuthors);
                }
                
                return new Promise(resolve => resolve(null));
            });
        });
    })
    .then(() => {
        console.log("Done doner donest!");
        res.send(returnObj);
    })
    .catch(error => {
        console.log("ERROR!", error);
        returnObj.success = false;
        returnObj.error = error;
        res.send(returnObj);
    });
};

const createQuote = (req, res) => {
    /*  INCOMING:
        {
            quote: {
                text: ...,
                title_id: num >= 0, -1, or null
            },
            title: {
                value: num >= 0, -1, or null,
                type_id: num >= 0 or null
            },
            authors: [
                { id: ..., value: ... },
                ...
            ],
            tags: [
                { id: ..., value: ... },
                ...
            ]
        };
    */

    bookshelf.transaction(t => {
        return new Promise((resolve, reject) => {
            if(req.body.quote.title_id == null) {
                console.log("This quote does not belong to a title; on to the next step");
                return resolve(null);
            }

            if(req.body.quote.title_id >= 0) {
                console.log("Existing title; on to the next step");
                return resolve(req.body.quote.title_id);
            }

            console.log("Title does not exist yet; create");

            let titleObj = {};
            titleObj.value = req.body.title.value;
            if(req.body.title.type_id)
                titleObj.type_id = req.body.title.type_id;

            new db.Title().save(titleObj, { transacting: t })
            .then(newTitle => resolve(newTitle.get("id")))
            .catch(error => reject(error));
        })
        .then(titleId => {
            req.body.title.id = titleId;
            
            console.log("Nice!  And now for the biz de la biz: creating the quote!");
            return new db.Quote().save({
                text: req.body.quote.text,
                title_id: req.body.title.id,
                date_added: new Date()
            }, { transacting: t });
        })
        .then(newQuote => {
            newQuote = newQuote.toJSON();
            console.log("Quote creation done :)", newQuote);
            req.body.quote.id = newQuote.id;

            let newAuthors = req.body.authors.filter(author => author.id == -1);
            console.log("Create new author entries", newAuthors);
            return Promise.all(
                newAuthors.map(newAuthor => new db.Author().save({ value: newAuthor.value }, { transacting: t }))
            );
        })
        .then(newAuthors => {
            console.log(`${newAuthors.length} new authors created`);
            newAuthors = newAuthors.map(newAuthor => newAuthor.get("id"));

            req.body.authors = req.body.authors.filter(author => author.id >= 0).map(author => author.id);
            req.body.authors = req.body.authors.concat(newAuthors);
            console.log("New and improved list of authors", req.body.authors);

            if(req.body.quote.title_id) {
                if(req.body.quote.title_id >= 0) {
                    //1. if there are new authors [for this title], delete all title-author relationships for this title
                    //and allocate those authors to the existing quotes in the title
                    //2. create quote-author relationships for new quote
                    console.log("This is an existing title, and we need to check if the authors listed for it on the db match what's been sent");
                    return new db.TitleAuthors()
                    .where({ title_id: req.body.quote.title_id })
                    .orderBy("author_id", "ASC")
                    .fetch()
                    .then(titleAuthors => {
                        if(titleAuthors.length > 0) { //There are authors associated with the title
                            titleAuthors = titleAuthors.toJSON();
                            let existingAuthors = titleAuthors.map(titleAuthor => titleAuthor.author_id);
                            let authorListsMatch = true;
                            
                            //Does the list of authors received match the list of existing authors?
                            if(existingAuthors.length == req.body.authors.length) {
                                req.body.authors.sort((authorX, authorY) => {
                                    if(authorX > authorY) return 1;
                                    if(authorX < authorY) return -1;
                                    return 0;
                                });

                                for(let i = 0; authorListsMatch && i < existingAuthors.length; i++)
                                    if(existingAuthors[i] != req.body.authors[i])
                                        authorListsMatch = false;
                            } else {
                                authorListsMatch = false;
                            }

                            console.log("Existing authors for this title", existingAuthors);
                            console.log(`Author lists ${authorListsMatch ? "do" : "don't"} match!`);

                            if(authorListsMatch) {
                                //no changes to be made here
                                console.log("So no need to create quote-author relationships etc");
                                return new Promise(resolve => resolve([]));
                            } else {
                                console.log("So we need to remove the title-author bond and change the relationships to quote-author relationships");
                                //1. Fetch quotes under this title_id and create quote-author relationships using the existing authors for this title
                                //2. Delete all title-author relationships for this title
                                //3. Create quote-author relationship for new quote using req.body.authors
                                return new db.Quotes()
                                    .where({ title_id: req.body.quote.title_id })
                                .fetch({ columns: "id" })
                                .then(quotesInThisTitle => {
                                    quotesInThisTitle = quotesInThisTitle.toJSON();

                                    let quoteAuthorRelationships = [];
                                    for(let i = 0; i < existingAuthors.length; i++)
                                        quoteAuthorRelationships = quoteAuthorRelationships.concat(quotesInThisTitle.map(
                                            quote => new db.QuoteAuthor().save({ 
                                                quote_id: quote.id,
                                                author_id: existingAuthors[i]
                                            }, { transacting: t }))
                                        );

                                    return Promise.all(quoteAuthorRelationships);
                                })
                                .then(() => {
                                    return new db.TitleAuthor()
                                        .where({ title_id: req.body.quote.title_id })
                                        .destroy({ transacting: t, require: false });
                                })
                                .then(() => {
                                    return Promise.all(req.body.authors.map(author => 
                                            new db.QuoteAuthor()
                                            .save({
                                                quote_id: req.body.quote.id,
                                                author_id: author
                                            }, { transacting: t })
                                        )
                                    );
                                });
                            }
                        } else { //no authors associated with the title, so associate authors received with the quote directly
                            console.log("This title has no authors associated with it, so we will create quote-author relationships instead");
                            return Promise.all(req.body.authors.map(author => 
                                new db.QuoteAuthor()
                                .save({
                                    quote_id: req.body.quote.id,
                                    author_id: author
                                }, { transacting: t }))
                            );
                        }
                    });
                } else { //new title
                    //so just create the new title/author relationships
                    console.log("It's a brand new title, so let's set up some brand new relationships");
                    return Promise.all(
                        req.body.authors.map(
                            author => new db.TitleAuthor().save({
                                title_id: req.body.title.id,
                                author_id: author
                            }, { transacting: t })
                        )
                    );
                }
            } else { //quote doesn't belong to a title
                //create quote-author relationships
                console.log("This quote does not belong to a title, so we will create quote-author relationships");
                return Promise.all(req.body.authors.map(author =>
                    new db.QuoteAuthor()
                    .save({
                        quote_id: req.body.quote.id,
                        author_id: author
                    }, { transacting: t })
                ));
            }
        })
        .then(() => {
            let newTags = req.body.tags.filter(tag => tag.id == -1);
            console.log("Creating new tags", newTags);
            return Promise.all(
                newTags.map(tag => new db.Tag().save({ value: tag.value }, { transacting: t }))
            );
        })
        .then(newTags => {
            newTags = newTags.map(tag => { 
                return {
                    quote_id: req.body.quote.id,
                    tag_id: tag.get("id")
                }
            });

            let tagsToAssociateWithQuote = req.body.tags.filter(tag => tag.id >= 0).map(tag => { 
                return {
                    quote_id: req.body.quote.id,
                    tag_id: tag.id 
                }
            });
            tagsToAssociateWithQuote = tagsToAssociateWithQuote.concat(newTags);
            console.log(`About to create ${tagsToAssociateWithQuote.length} quote-tag relationships`);

            return Promise.all(tagsToAssociateWithQuote.map(tag => new db.QuoteTag().save(tag, { transacting: t })));
        })
        .then(() => {
            console.log("Finito!");
            res.status(200).send("All good :)");
        })
        .catch(error => {
            console.log("ERROR!", error);
            res.status(500).send(error);
        });
    });
    
};

module.exports = {
    findQuoteById,
    getQuotes,
    updateQuote,
    deleteQuote,
    createQuote
};