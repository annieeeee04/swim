package com.annie.swim.agent.skill;

import com.annie.swim.model.SwimEvent;
import com.annie.swim.model.User;
import com.annie.swim.service.UbcFeedService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScheduleSkillTest {

    private final ObjectMapper mapper = new ObjectMapper();

    /** Feed stub: skills only call getSchedule(), so override just that. */
    private static UbcFeedService feedWith(List<SwimEvent> events) {
        return new UbcFeedService(10) {
            @Override
            public List<SwimEvent> getSchedule() {
                return events;
            }
        };
    }

    private static SwimEvent event(String title, String date, String start, String end) {
        SwimEvent ev = new SwimEvent();
        ev.setEventId(title + start);
        ev.setTitle(title);
        ev.setStart(date + "T" + start + ":00");
        ev.setEnd(date + "T" + end + ":00");
        ev.setFacilityName("UBC Aquatic Centre");
        return ev;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> run(ScheduleSkill skill, String argsJson) throws Exception {
        JsonNode args = mapper.readTree(argsJson);
        SkillResult result = skill.execute(new SkillContext(new User()), args);
        Map<String, Object> data = (Map<String, Object>) result.data();
        return (List<Map<String, Object>>) data.get("sessions");
    }

    @Test
    void filtersByPoolLengthAndTime() throws Exception {
        String day = LocalDate.now().plusDays(1).toString();
        ScheduleSkill skill = new ScheduleSkill(feedWith(List.of(
                event("50m Length Swim", day, "07:00", "08:30"),
                event("50m Length Swim", day, "19:00", "20:30"),
                event("25m Length Swim", day, "19:00", "20:30"))));

        List<Map<String, Object>> sessions = run(skill, "{\"poolLength\":50,\"after\":\"18:00\"}");

        assertEquals(1, sessions.size());
        assertEquals("19:00", sessions.get(0).get("start"));
        assertEquals(50, sessions.get(0).get("poolLength"));
    }

    @Test
    void filtersByDate() throws Exception {
        String d1 = LocalDate.now().plusDays(1).toString();
        String d2 = LocalDate.now().plusDays(2).toString();
        ScheduleSkill skill = new ScheduleSkill(feedWith(List.of(
                event("25m Length Swim", d1, "12:00", "13:00"),
                event("25m Length Swim", d2, "12:00", "13:00"))));

        List<Map<String, Object>> sessions = run(skill, "{\"date\":\"" + d2 + "\"}");

        assertEquals(1, sessions.size());
        assertEquals(d2, sessions.get(0).get("date"));
    }

    @Test
    void emptyArgsReturnsEverythingUpToLimit() throws Exception {
        String day = LocalDate.now().plusDays(1).toString();
        ScheduleSkill skill = new ScheduleSkill(feedWith(List.of(
                event("25m Length Swim", day, "09:00", "10:00"),
                event("50m Length Swim", day, "11:00", "12:00"))));

        List<Map<String, Object>> sessions = run(skill, "{}");

        assertEquals(2, sessions.size());
        assertTrue(sessions.get(0).containsKey("day"));
    }
}
