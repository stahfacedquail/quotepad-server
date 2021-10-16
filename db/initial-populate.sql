DROP TABLE quote_tags;
DROP TABLE title_authors;
DROP TABLE tags;
DROP TABLE quotes;
DROP TABLE titles;
DROP TABLE title_types;
DROP TABLE authors;

CREATE TABLE title_types (
	id SERIAL PRIMARY KEY,
	value varchar(100) NOT NULL
);

CREATE TABLE tags (
	id SERIAL PRIMARY KEY,
	value varchar(255) NOT NULL
);

CREATE TABLE titles (
	id SERIAL PRIMARY KEY,
	value varchar(512) NOT NULL,
	type_id integer REFERENCES title_types(id),
	url varchar(1023)
);

CREATE TABLE authors (
	id SERIAL PRIMARY KEY,
	value varchar(255) NOT NULL
);

CREATE TABLE quotes (
	id SERIAL PRIMARY KEY,
	text varchar(4095) NOT NULL,
	title_id integer REFERENCES titles(id),
	is_favourite boolean DEFAULT false,
	date_added date
);

CREATE TABLE quote_tags (
	quote_id integer NOT NULL REFERENCES quotes(id),
	tag_id integer NOT NULL REFERENCES tags(id),
	PRIMARY KEY(quote_id, tag_id)
);

CREATE TABLE title_authors (
	title_id integer NOT NULL REFERENCES titles(id),
	author_id integer NOT NULL REFERENCES authors(id),
	PRIMARY KEY(title_id, author_id)
);

INSERT INTO title_types(value) VALUES
	('Book'),
	('Video'),
	('Song'),
	('Article'),
	('Movie'),
	('Poem');
	
INSERT INTO tags(value) VALUES
	('race'),
    ('privilege'),
    ('identity'),
    ('beauty'),
    ('transgender'),
    ('love'),
    ('segregation'),
    ('access'),
    ('inequality'),
    ('political correctness'),
    ('gender'),
    ('masculinity'),
    ('LGBTQIA+'),
    ('inspiration'),
    ('sleep'),
	('philosophy'),
	('the heart');
	
INSERT INTO titles(value, type_id, url) VALUES
	('The New Apartheid', 1, NULL),
	('Girl, Woman, Other', 1, NULL),
	('Homegoing', 1, NULL),
    ('Nervous Conditions', 1, NULL),
    ('Slavoj Zizek on #MeToo movement. How to Watch the News, episode 02', 2, 'https://www.youtube.com/watch?v=ai_UAPaoEW4'),
    ('Half of a Yellow Sun', 1, NULL),
    ('Men hating women', 4, 'https://www.gq-magazine.co.uk/article/men-hating-women'),
    ('Talking to white people about race', 1, NULL),
    ('Sing!', 5, NULL);

INSERT INTO authors(value) VALUES
	('Sizwe Mpofu-Walsh'),
	('Bernardine Evaristo'),
	('Yaa Gyasi'),
    ('Tsitsi Dangarembga'),
    ('Slavoj Zizek'),
    ('Chimamanda Ngozi Adichie'),
    ('George Chesterton'),
    ('Reno Eddo-Lodge');

INSERT INTO title_authors(title_id, author_id) VALUES
	(1, 1),
	(1, 2),
	(2, 2),
	(3, 3),
	(4, 4),
	(4, 5),
	(4, 1),
	(4, 3),
	(4, 8),
	(5, 5),
	(6, 6),
	(7, 7),
	(8, 8);

INSERT INTO quotes(text, title_id, is_favourite, date_added) VALUES
	('The pattern of apartheid, once visible at all scales, is now only visible at smaller scales.  This makes apartheid harder to see, but easier to survive.', 1, true, '2021-08-11'),
	('Black enmeshment in the system of privilege is a key feature of the new apartheid.  This enmeshment serves two functions: it distracts from racialised exclusion and incentivises Black compliance.  Prior to 1994, resistance to apartheid was justifiable from the perspective of both self-interest and social interest.\n   Today, self-interest and social interest diverge, as Black South Africans are increasingly torn between contradictory desires for spectacular wealth and revolutionary equality.', 1, false, '2021-08-11'),
	('   people won''t see you as just another woman any more, but as a white woman who hangs with brownies, and you''ll lose a bit of your privilege, you should still check it, though, have you heard the expression, check your privilege, babe?\n   Courtney replied that seeing as Yazz is the daughter of a professor and a very well-known theatre director, she''s hardly underprivileged herself, whereas she, Courtney, comes from a really poor community where it''s normal to be working in a factory at sixteen and have your first child as a single mother at seventeen, and that her father''s farm is effectively owned by the bank\n   yes but I''m black, Courts, which makes me more oppressed than anyone who isn''t, except Waris who is the most oppressed of all of them (although don''t tell her that)\n   in five categories: black, Muslim, female, poor, hijabbed\n   she''s the only one Yazz can''t tell to check her privilege\n   Courtney replied that Roxane Gay warned against the idea of playing ''privilege Olympics'' and wrote in Bad Feminist that privilege is relative and contextual, and I agree, Yazz, I mean, where does it all end?  is Obama less privileged than a white hillbilly growing up in a trailer park with a junkie single mother and a jailbird father?  is a severely disabled person more privileged than a Syrian asylum-seeker who''s been tortured?  Roxane argues that we have to find a new discourse for discussing inequality.', 2, true, '2021-05-23'),
	('   Megan should have been grateful and accepted her cute status, what girl doesn''t want to be told how lovely she is, how special?\n   except it felt wrong, even at a young age, something in her realized that her prettiness was supposed to make her compliant, and when she wasn''t, when she rebelled, she was letting down all those invested in her being adorable.', 2, false, '2021-07-09'),
	('Weakness is treating someone as though they belong to you.  Strength is knowing that everyone belongs to themselves.', 3, false, '2021-03-01'),
	('This is how we all come to the world, James.  Weak and needy, desperate to learn how to be a person... But if we do not like the person  we have learned to be, should we just sit in front of our fufu, doing nothing?  I think, James, that maybe it is possible to make a new way.', 3, false, '2021-05-20'),
	('For Sonny, the problem with America wasn''t segregation but the fact that you could not, in fact, segregate.  Sonny had been trying to get away from white people for as long as he could remember, but, big as the country was, there was nowhere to go... The practice of segregation meant that he had to feel his separateness as inequality, and _that_ was what he could not take.', 3, false, '2021-07-09'),
	('... but later I realised that she really eid not mind carrying Nhamo''s luggage if there wasn''t too much of it.  She was a sweet child, the type that will make a sweet, sad wife.', 4, false, '2019-08-04'),
	('... I have seen enough to know that blame does not come in neatly packaged parcels.', 4, false, '2019-08-04'),
	('... this excessive nature -- ''you say one wrong word, you are immediately excluded'' and so on -- is a mask of the fact that #MeToo, the way it predominates today, it doesn''t touch the real social problems: poverty, daily exploitation, and so on and so on.  And that''s for me generally the problem with political correctness: it deals with polite forms of talking, acting, and so on and so on.  It doesn''t approach the true economic roots of this crisis.', 5, false, '2019-01-17'),
	('... it''s wrong of you to think that love leaves room for nothing else.', 6, true, '2018-10-03'),
	('The idea that masculinity is now toxic suggests we''ve only just noticed. For millennia, rigidity and repetition has been ingrained into male and female identities, but behind these social structures may be something more primal. An unholy stew of psychology and the culture that springs from it has made men what they are. Toxic masculinity is a tautology.', 7, false, '2018-11-07'),
	('Masculinity is not in a state of crisis. Masculinity is a crisis.', 7, false, '2018-11-07'),
	('Masculinity and the misogyny it allows is so embedded men rarely recognise it. It affects our physical and mental health, and it builds walls few of us even acknowledge, let alone attempt to peer beyond. \"The LGBTQ movement is having the argument for all of us,\" says Jukes. \"In essence, they are fighting this battle for everyone, gnawing away at the edges of these definitions of femininity and masculinity and we will all be liberated by their success.\"', 7, true, '2018-11-07'),
	('Hendon Police College wanted John and his colleagues to develop a course about multiculturalism to teach to police cadets in training... But he immediately ran into problems.  The first red flag was that the college wanted to put an emphasis on multiculturalism rather than anti-racism.  ''I was not very happy, as a black sociologist,'' he explained.  ''I wanted an anti-racist approach to it.  Because the problem is not a black problem.  It''s not my culture, not my religion that is the problem.  It is the racism of the white institutions.''  To go about proving that his anti-racist perspective would be more useful, he had to do a bit of research... He had to demonstrate that there was an already existing racist bias in the college''s new recruits.  ''As part of my research, I might have found that none of the cadets had a racist bias, maybe just a couple, so it''s not a problem, so I''ll do the multicultural course.''  His research saw him ask trainee police cadets at the college to write anonymous essay on the topic of ''blacks'' in Britain.  The responses were shocking.', 8, false, '2019-02-11'),
	('Go to sleep and dream big dreams.', 9, false, '2020-12-15'),
	('Get a good night''s sleep and do a great day''s work.', 9, true, '2020-12-15');

INSERT INTO quote_tags(quote_id, tag_id) VALUES
	(1,1),
	(2,1),
	(2,2),
	(3,1),
	(3,2),
	(3,9),
	(4,3),
	(4,4),
	(4,5),
	(5,6),
	(6,3),
	(7,1),
	(7,7),
	(7,8),
	(7,9),
	(8,3),
	(8,6),
	(10,9),
	(10,10),
	(11,6),
	(11,16),
	(11,17),
	(12,11),
	(12,12),
	(13,11),
	(13,12),
	(14,11),
	(14,12),
	(14,13),
	(15,1),
	(16,14),
	(17,14),
	(17,15);