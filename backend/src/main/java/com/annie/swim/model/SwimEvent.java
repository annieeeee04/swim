package com.annie.swim.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * One drop-in swim session as returned by the UBC recreation pm-feed API.
 * @JsonAlias accepts the feed's lowercase wire keys (servicename, facilityname,
 * facilitytype) on the way in; @JsonProperty controls the camelCase keys we
 * actually serialize back out to the frontend.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SwimEvent {

    @JsonProperty("eventId")
    private String eventId;

    @JsonProperty("title")
    private String title;

    @JsonProperty("serviceName")
    @JsonAlias("servicename")
    private String serviceName;

    @JsonProperty("facilityName")
    @JsonAlias("facilityname")
    private String facilityName;

    @JsonProperty("facilityType")
    @JsonAlias("facilitytype")
    private String facilityType;

    @JsonProperty("start")
    private String start;

    @JsonProperty("end")
    private String end;

    @JsonProperty("description")
    private String description;

    @JsonProperty("curl")
    private String curl;

    @JsonProperty("capacity")
    private Integer capacity;

    public SwimEvent() {
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public String getFacilityName() {
        return facilityName;
    }

    public void setFacilityName(String facilityName) {
        this.facilityName = facilityName;
    }

    public String getFacilityType() {
        return facilityType;
    }

    public void setFacilityType(String facilityType) {
        this.facilityType = facilityType;
    }

    public String getStart() {
        return start;
    }

    public void setStart(String start) {
        this.start = start;
    }

    public String getEnd() {
        return end;
    }

    public void setEnd(String end) {
        this.end = end;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCurl() {
        return curl;
    }

    public void setCurl(String curl) {
        this.curl = curl;
    }

    public Integer getCapacity() {
        return capacity;
    }

    public void setCapacity(Integer capacity) {
        this.capacity = capacity;
    }

    /** True if this is a 50m session (vs. 25m), inferred from the title. */
    public boolean isFiftyMeter() {
        return title != null && title.toLowerCase().contains("50m");
    }
}
